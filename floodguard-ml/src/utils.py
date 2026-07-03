"""Shared helpers for FloodGuard's prototype Python ML pipeline."""

from __future__ import annotations

import json
import math
import os
import sys
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_ROOT / "data"
REPORTS_DIR = PROJECT_ROOT / "reports"
MODELS_DIR = PROJECT_ROOT / "models"
VENDOR_DIR = PROJECT_ROOT / ".vendor"
MPL_CONFIG_DIR = PROJECT_ROOT / ".matplotlib-cache"

if VENDOR_DIR.exists():
    if sys.version_info[:2] != (3, 12):
        raise RuntimeError(
            "FloodGuard's vendored ML dependencies currently target Python 3.12. "
            "Please run the ML pipeline with python3.12."
        )
    sys.path.insert(0, str(VENDOR_DIR))
os.environ.setdefault("MPLCONFIGDIR", str(MPL_CONFIG_DIR))

import joblib  # type: ignore
import matplotlib
matplotlib.use("Agg")
import numpy as np
import pandas as pd
from matplotlib import pyplot as plt
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    balanced_accuracy_score,
    brier_score_loss,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

LABEL_COLUMN = "targetElevatedConcern"
FEATURE_EXPORT_DATASET = DATA_DIR / "floodguard_features.csv"
LABELS_DATASET = DATA_DIR / "labels.csv"
DEFAULT_DATASET = DATA_DIR / "floodguard_training_dataset.csv"
SCENARIO_DATASET = DATA_DIR / "floodguard_scenario_features.csv"
TRAINING_ELIGIBILITY_COLUMN = "trainingEligibility"
SCENARIO_NAME_COLUMN = "scenarioName"
GROUP_TIMESTAMP_COLUMN = "observedAt"
TARGET_LABEL_COLUMN = "ruleConcernLevel"
LABEL_SOURCE_COLUMN = "labelSource"
RULE_TARGET_COLUMN = "targetRuleElevated"
EVENT_TARGET_COLUMN = "targetEventElevated"
RULE_LABEL_SOURCE_COLUMN = "ruleLabelSource"
EVENT_LABEL_SOURCE_COLUMN = "eventLabelSource"
EVENT_LABEL_STRENGTH_COLUMN = "eventLabelStrength"
EVENT_LABEL_NOTES_COLUMN = "eventLabelNotes"
EVENT_LABEL_AVAILABLE_COLUMN = "eventLabelAvailable"
AREA_COLUMN = "areaId"
TARGET_SELECTION_MIN_ROWS = 30
TARGET_SELECTION_MIN_POSITIVES = 8

LEAKAGE_PRONE_COLUMNS = [
    "riskScore",
    "ruleConcernLevel",
    "targetElevatedConcern",
    "targetRuleElevated",
    "targetEventElevated",
    "labelSource",
    "ruleLabelSource",
    "eventLabelSource",
    "eventLabelStrength",
    "eventLabelNotes",
    "eventLabelAvailable",
    "notificationType",
    "decisionAuditReason",
]

# These predictors stay closer to real signals and reliability context rather than
# directly reusing the rule-engine's own output score as an input feature.
FEATURE_COLUMNS = [
    "areaId",
    "rainfallLatestMm",
    "rainfall1hMm",
    "rainfall3hMm",
    "rainfall24hMm",
    "rainfall72hMm",
    "antecedentWetnessMm",
    "antecedentRainfallIndex",
    "riverLatestM",
    "riverDelta1hM",
    "riverDelta3hM",
    "riverTrendCode",
    "rateOfRiseMPerHour",
    "dataFreshnessScore",
    "sourceCoverage",
    "warningActive",
    "areaRelevanceScore",
    "nearestStationDistanceKm",
]

NUMERIC_FEATURES = [
    feature for feature in FEATURE_COLUMNS if feature not in {"areaId"}
]
CATEGORICAL_FEATURES = ["areaId"]


def ensure_runtime_dirs() -> None:
    """Create the standard directories used by the ML pipeline."""

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    MPL_CONFIG_DIR.mkdir(parents=True, exist_ok=True)


def to_python(value: Any) -> Any:
    """Convert numpy scalars and arrays into plain Python values for JSON output."""

    if isinstance(value, (np.generic,)):
        return value.item()
    if isinstance(value, np.ndarray):
        return value.tolist()
    if isinstance(value, dict):
        return {key: to_python(item) for key, item in value.items()}
    if isinstance(value, list):
        return [to_python(item) for item in value]
    return value


def write_json(path: Path, payload: dict[str, Any]) -> None:
    """Write a JSON artifact with stable pretty formatting."""

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"{json.dumps(to_python(payload), indent=2)}\n", encoding="utf-8")


def load_dataset(dataset_path: Path) -> pd.DataFrame:
    """Load a CSV dataset and normalise the expected field types."""

    dataframe = pd.read_csv(dataset_path)

    if LABEL_COLUMN not in dataframe.columns:
        raise ValueError(f"{dataset_path} is missing required label column: {LABEL_COLUMN}")

    if LABEL_SOURCE_COLUMN not in dataframe.columns:
        dataframe[LABEL_SOURCE_COLUMN] = "unknown"

    if TARGET_LABEL_COLUMN not in dataframe.columns:
        dataframe[TARGET_LABEL_COLUMN] = "Unknown"

    if TRAINING_ELIGIBILITY_COLUMN not in dataframe.columns:
        dataframe[TRAINING_ELIGIBILITY_COLUMN] = 1

    for column in FEATURE_COLUMNS + [LABEL_COLUMN, "riskScore"]:
        if column in dataframe.columns and column != "areaId":
            dataframe[column] = pd.to_numeric(dataframe[column], errors="coerce")

    dataframe[LABEL_COLUMN] = (
        pd.to_numeric(dataframe[LABEL_COLUMN], errors="coerce").fillna(0).astype(int)
    )
    dataframe[TRAINING_ELIGIBILITY_COLUMN] = (
        pd.to_numeric(dataframe[TRAINING_ELIGIBILITY_COLUMN], errors="coerce")
        .fillna(1)
        .astype(int)
    )
    dataframe[GROUP_TIMESTAMP_COLUMN] = pd.to_datetime(
        dataframe[GROUP_TIMESTAMP_COLUMN], errors="coerce", utc=True
    )
    return dataframe


def build_dataset_summary(dataframe: pd.DataFrame, dataset_name: str) -> dict[str, Any]:
    """Summarise dataset size, class balance, and missingness for reporting."""

    usable = dataframe[dataframe[TRAINING_ELIGIBILITY_COLUMN] == 1].copy()
    target_counts = usable[LABEL_COLUMN].value_counts(dropna=False).to_dict()
    rule_counts = usable[TARGET_LABEL_COLUMN].value_counts(dropna=False).to_dict()
    label_counts = usable[LABEL_SOURCE_COLUMN].value_counts(dropna=False).to_dict()
    missing_counts = usable.isna().sum().to_dict()
    rule_label_counts = (
        usable[RULE_LABEL_SOURCE_COLUMN].value_counts(dropna=False).to_dict()
        if RULE_LABEL_SOURCE_COLUMN in usable.columns
        else {}
    )
    event_label_counts = (
        usable[EVENT_LABEL_SOURCE_COLUMN].fillna("unlabelled").value_counts(dropna=False).to_dict()
        if EVENT_LABEL_SOURCE_COLUMN in usable.columns
        else {}
    )
    event_label_strength_counts = (
        usable[EVENT_LABEL_STRENGTH_COLUMN]
        .fillna("unknown")
        .value_counts(dropna=False)
        .to_dict()
        if EVENT_LABEL_STRENGTH_COLUMN in usable.columns
        else {}
    )
    event_label_available = (
        int(usable[EVENT_LABEL_AVAILABLE_COLUMN].fillna(0).astype(int).sum())
        if EVENT_LABEL_AVAILABLE_COLUMN in usable.columns
        else 0
    )
    event_positive_count = (
        int((usable[EVENT_TARGET_COLUMN].fillna(0) == 1).sum())
        if EVENT_TARGET_COLUMN in usable.columns
        else 0
    )

    positive_count = int(target_counts.get(1, 0))
    row_count = int(len(usable))
    positive_rate = positive_count / row_count if row_count else 0.0

    return {
        "datasetName": dataset_name,
        "rowCount": row_count,
        "excludedRowCount": int(len(dataframe) - row_count),
        "areaCount": int(usable["areaName"].nunique()) if "areaName" in usable.columns else 0,
        "areas": sorted(usable["areaName"].dropna().unique().tolist())
        if "areaName" in usable.columns
        else [],
        "uniqueTimestamps": int(usable[GROUP_TIMESTAMP_COLUMN].dropna().nunique()),
        "labelSourceCounts": label_counts,
        "ruleLabelSourceCounts": rule_label_counts,
        "eventLabelSourceCounts": event_label_counts,
        "eventLabelStrengthCounts": event_label_strength_counts,
        "ruleConcernLevelCounts": rule_counts,
        "targetCounts": {str(key): int(value) for key, value in target_counts.items()},
        "positiveRate": positive_rate,
        "eventLabelCoverage": event_label_available / row_count if row_count else 0.0,
        "eventLabelRowCount": event_label_available,
        "eventPositiveCount": event_positive_count,
        "missingByColumn": {key: int(value) for key, value in missing_counts.items()},
    }


def build_dataset_warnings(summary: dict[str, Any]) -> list[str]:
    """Turn dataset summary facts into human-readable shadow-mode warnings."""

    warnings: list[str] = []
    row_count = summary["rowCount"]
    positive_count = summary["targetCounts"].get("1", 0)
    positive_rate = summary["positiveRate"]
    high_count = summary["ruleConcernLevelCounts"].get("High", 0)
    label_sources = summary["labelSourceCounts"]
    event_label_row_count = summary.get("eventLabelRowCount", 0)
    event_positive_count = summary.get("eventPositiveCount", 0)
    event_label_strengths = summary.get("eventLabelStrengthCounts", {})

    if row_count < 30:
        warnings.append(
            f"Dataset is small: only {row_count} training-eligible row(s) are available."
        )
    if positive_count < 25:
        warnings.append(
            f"Dataset has severe class imbalance: {positive_count} elevated row(s) out of {row_count}."
        )
    if positive_rate < 0.05:
        warnings.append(
            f"Positive rate is only {positive_rate:.1%}; plain accuracy would be misleading."
        )
    if label_sources == {"rule_derived": row_count}:
        warnings.append(
            "Labels are rule-derived, not independent flood outcomes, so metrics are illustrative only."
        )
    if event_label_row_count == 0:
        warnings.append(
            "No independently joined event labels are available yet; targetEventElevated remains unlabelled."
        )
    elif event_positive_count == 0:
        warnings.append(
            "Joined event labels currently contain no elevated positives, so they are useful for plumbing but not event validation."
        )
    if event_label_strengths == {"weak": event_label_row_count} and event_label_row_count > 0:
        warnings.append(
            "Current joined event labels are all weak-strength placeholders and must not be treated as validated outcomes."
        )
    if high_count == 0:
        warnings.append("No High class examples are available in this dataset.")

    missing_columns = [
        column
        for column, count in summary["missingByColumn"].items()
        if row_count > 0 and column in FEATURE_COLUMNS and count / row_count >= 0.5
    ]
    if missing_columns:
        warnings.append(
            "Some predictors are heavily missing and will rely on imputation: "
            + ", ".join(sorted(missing_columns))
            + "."
        )

    if summary["excludedRowCount"] > 0:
        warnings.append(
            f"{summary['excludedRowCount']} row(s) were excluded from training due to eligibility gates."
        )

    return warnings


def choose_training_target(dataframe: pd.DataFrame) -> dict[str, Any]:
    """Choose the strongest viable target layer without pretending weak labels are validated."""

    usable = dataframe[dataframe[TRAINING_ELIGIBILITY_COLUMN] == 1].copy()
    rule_target_column = RULE_TARGET_COLUMN if RULE_TARGET_COLUMN in usable.columns else LABEL_COLUMN
    rule_label_source_column = (
        RULE_LABEL_SOURCE_COLUMN if RULE_LABEL_SOURCE_COLUMN in usable.columns else LABEL_SOURCE_COLUMN
    )
    usable = usable.dropna(subset=[rule_target_column]).copy()
    rule_positive_count = int((usable[rule_target_column].fillna(0).astype(int) == 1).sum())

    base_selection = {
        "selectedTargetColumn": rule_target_column,
        "selectedLabelSourceColumn": rule_label_source_column,
        "selectedLabelAvailabilityColumn": None,
        "selectedTargetKind": "rule",
        "readyForIndependentSupervision": False,
        "reason": "Fallback to rule-derived target because independent event labels are too sparse or weak.",
        "eligibleRowCount": int(len(usable)),
        "positiveCount": rule_positive_count,
        "sourceCounts": usable[rule_label_source_column].fillna("rule_derived").value_counts(dropna=False).to_dict()
        if rule_label_source_column in usable.columns
        else {"rule_derived": int(len(usable))},
    }

    if EVENT_TARGET_COLUMN not in usable.columns or EVENT_LABEL_AVAILABLE_COLUMN not in usable.columns:
        return base_selection

    labelled = usable[usable[EVENT_LABEL_AVAILABLE_COLUMN].fillna(0).astype(int) == 1].copy()
    if labelled.empty:
        return {
            **base_selection,
            "reason": "Fallback to rule-derived target because no event-labelled rows are available yet.",
        }

    event_positive_count = int((labelled[EVENT_TARGET_COLUMN].fillna(0).astype(int) == 1).sum())
    strength_counts = (
        labelled[EVENT_LABEL_STRENGTH_COLUMN].fillna("unknown").value_counts(dropna=False).to_dict()
        if EVENT_LABEL_STRENGTH_COLUMN in labelled.columns
        else {}
    )
    all_weak = set(strength_counts.keys()).issubset({"weak", "unknown"})

    if len(labelled) < TARGET_SELECTION_MIN_ROWS:
        return {
            **base_selection,
            "reason": f"Fallback to rule-derived target because only {len(labelled)} event-labelled row(s) are available.",
            "eventTargetCandidate": {
                "eligibleRowCount": int(len(labelled)),
                "positiveCount": event_positive_count,
                "strengthCounts": {str(key): int(value) for key, value in strength_counts.items()},
            },
        }

    if event_positive_count < TARGET_SELECTION_MIN_POSITIVES:
        return {
            **base_selection,
            "reason": f"Fallback to rule-derived target because event-labelled rows contain only {event_positive_count} elevated example(s).",
            "eventTargetCandidate": {
                "eligibleRowCount": int(len(labelled)),
                "positiveCount": event_positive_count,
                "strengthCounts": {str(key): int(value) for key, value in strength_counts.items()},
            },
        }

    if all_weak:
        return {
            **base_selection,
            "reason": "Fallback to rule-derived target because all event-labelled rows are still weak-strength placeholders.",
            "eventTargetCandidate": {
                "eligibleRowCount": int(len(labelled)),
                "positiveCount": event_positive_count,
                "strengthCounts": {str(key): int(value) for key, value in strength_counts.items()},
            },
        }

    return {
        "selectedTargetColumn": EVENT_TARGET_COLUMN,
        "selectedLabelSourceColumn": EVENT_LABEL_SOURCE_COLUMN,
        "selectedLabelAvailabilityColumn": EVENT_LABEL_AVAILABLE_COLUMN,
        "selectedTargetKind": "event",
        "readyForIndependentSupervision": True,
        "reason": "Event-labelled rows have enough coverage and elevated examples for shadow-mode event supervision.",
        "eligibleRowCount": int(len(labelled)),
        "positiveCount": event_positive_count,
        "sourceCounts": labelled[EVENT_LABEL_SOURCE_COLUMN].fillna("unknown").value_counts(dropna=False).to_dict(),
        "strengthCounts": {str(key): int(value) for key, value in strength_counts.items()},
    }


def apply_training_target_selection(
    dataframe: pd.DataFrame, selection: dict[str, Any]
) -> pd.DataFrame:
    """Project the selected target into the shared training alias columns used downstream."""

    target_column = selection["selectedTargetColumn"]
    label_source_column = selection["selectedLabelSourceColumn"]
    availability_column = selection.get("selectedLabelAvailabilityColumn")
    projected = dataframe.copy()

    if availability_column:
        projected = projected[projected[availability_column].fillna(0).astype(int) == 1].copy()

    projected = projected.dropna(subset=[target_column]).copy()
    projected[LABEL_COLUMN] = pd.to_numeric(projected[target_column], errors="coerce").fillna(0).astype(int)
    if label_source_column in projected.columns:
        projected[LABEL_SOURCE_COLUMN] = projected[label_source_column].fillna("unknown")
    else:
        projected[LABEL_SOURCE_COLUMN] = "unknown"

    projected["selectedTrainingTarget"] = selection["selectedTargetColumn"]
    projected["selectedTrainingTargetKind"] = selection["selectedTargetKind"]
    return projected


def describe_missingness_level(rate: float) -> str:
    """Turn a missingness rate into a compact review label."""

    if rate >= 0.95:
        return "critical"
    if rate >= 0.5:
        return "high"
    if rate >= 0.2:
        return "moderate"
    if rate > 0:
        return "low"
    return "none"


def build_feature_quality_report(dataframe: pd.DataFrame, dataset_name: str) -> dict[str, Any]:
    """Summarise feature quality, coverage, and label readiness for ML review."""

    usable = dataframe[dataframe[TRAINING_ELIGIBILITY_COLUMN] == 1].copy()
    time_values = usable[GROUP_TIMESTAMP_COLUMN].dropna().sort_values()
    feature_columns, dropped_features, blocked_features = feature_columns_for_training(usable)
    feature_rows: list[dict[str, Any]] = []
    high_missing_features: list[str] = []
    critical_missing_features: list[str] = []
    constant_features: list[str] = []

    for column in FEATURE_COLUMNS:
        if column not in usable.columns:
            feature_rows.append(
                {
                    "feature": column,
                    "present": False,
                    "missingRate": 1.0,
                    "missingnessLevel": "critical",
                    "uniqueValueCount": 0,
                    "selectedForTraining": False,
                    "blockedFromTraining": column in blocked_features,
                    "warning": "Feature column is missing from the dataset export.",
                }
            )
            critical_missing_features.append(column)
            continue

        series = usable[column]
        missing_rate = float(series.isna().mean()) if len(usable) else 0.0
        unique_count = int(series.nunique(dropna=True))
        missingness_level = describe_missingness_level(missing_rate)
        feature_warning = None
        if unique_count <= 1 and not series.isna().all():
            feature_warning = "Feature is constant across the current dataset."
            constant_features.append(column)
        elif missing_rate >= 0.5:
            feature_warning = "Feature is heavily missing and will lean on imputation."
        elif missing_rate >= 0.2:
            feature_warning = "Feature has moderate missingness and should be monitored."

        if missing_rate >= 0.95:
            critical_missing_features.append(column)
        elif missing_rate >= 0.5:
            high_missing_features.append(column)

        feature_rows.append(
            {
                "feature": column,
                "present": True,
                "missingRate": missing_rate,
                "missingnessLevel": missingness_level,
                "uniqueValueCount": unique_count,
                "selectedForTraining": column in feature_columns,
                "blockedFromTraining": column in blocked_features,
                "warning": feature_warning,
            }
        )

    label_source_counts = (
        usable[LABEL_SOURCE_COLUMN].fillna("unknown").value_counts(dropna=False).to_dict()
        if LABEL_SOURCE_COLUMN in usable.columns
        else {}
    )
    event_sources = (
        usable[EVENT_LABEL_SOURCE_COLUMN].fillna("unlabelled").value_counts(dropna=False).to_dict()
        if EVENT_LABEL_SOURCE_COLUMN in usable.columns
        else {}
    )

    recommended_actions: list[str] = []
    if high_missing_features or critical_missing_features:
        recommended_actions.append(
            "Prioritise source or feature fixes for heavily missing rainfall/river/reliability predictors before treating ML metrics as stable."
        )
    if label_source_counts == {"rule_derived": int(len(usable))} and len(usable) > 0:
        recommended_actions.append(
            "Add stronger independent event labels because the current target still teaches ML to imitate the rule engine."
        )
    if usable[LABEL_COLUMN].sum() < 25:
        recommended_actions.append(
            "Collect more elevated examples before trusting ranking or probability behaviour on real exports."
        )
    if constant_features:
        recommended_actions.append(
            "Review constant features because they add no information and may reflect export or pilot-area limits."
        )

    return {
        "datasetName": dataset_name,
        "rowCount": int(len(usable)),
        "timeRange": {
            "start": None if time_values.empty else time_values.iloc[0].isoformat(),
            "end": None if time_values.empty else time_values.iloc[-1].isoformat(),
            "spanHours": None
            if len(time_values) < 2
            else round(
                (time_values.iloc[-1].to_pydatetime() - time_values.iloc[0].to_pydatetime()).total_seconds()
                / 3600,
                2,
            ),
        },
        "selectedFeatureCount": len(feature_columns),
        "droppedFeatureCount": len(dropped_features),
        "blockedFeatureCount": len(blocked_features),
        "highMissingFeatureCount": len(high_missing_features),
        "criticalMissingFeatureCount": len(critical_missing_features),
        "constantFeatureCount": len(constant_features),
        "labelSourceCounts": {str(key): int(value) for key, value in label_source_counts.items()},
        "eventLabelSourceCounts": {str(key): int(value) for key, value in event_sources.items()},
        "features": feature_rows,
        "recommendedActions": recommended_actions,
    }


def feature_columns_for_training(dataframe: pd.DataFrame) -> tuple[list[str], list[str], list[str]]:
    """Choose trainable features and record missing or blocked columns."""

    blocked = [column for column in FEATURE_COLUMNS if column in LEAKAGE_PRONE_COLUMNS]
    selected = [
        column
        for column in FEATURE_COLUMNS
        if column in dataframe.columns
        and column not in blocked
        and not dataframe[column].isna().all()
    ]
    dropped = [column for column in FEATURE_COLUMNS if column not in selected and column not in blocked]
    return selected, dropped, blocked


def assess_leakage_controls(
    dataframe: pd.DataFrame,
    feature_columns: list[str],
) -> dict[str, Any]:
    """Report which leakage-prone fields exist and whether any were blocked."""

    present_reference_only = [
        column for column in LEAKAGE_PRONE_COLUMNS if column in dataframe.columns
    ]
    blocked_from_training = [
        column for column in present_reference_only if column not in feature_columns
    ]
    unsafe_selected = [column for column in feature_columns if column in LEAKAGE_PRONE_COLUMNS]

    warnings: list[str] = []
    if blocked_from_training:
        warnings.append(
            "Leakage-prone columns are present in the dataset but excluded from training: "
            + ", ".join(blocked_from_training)
            + "."
        )
    if unsafe_selected:
        warnings.append(
            "Unsafe leakage-prone columns were selected for training and should be removed: "
            + ", ".join(unsafe_selected)
            + "."
        )

    return {
        "presentReferenceOnlyColumns": present_reference_only,
        "blockedFromTraining": blocked_from_training,
        "unsafeSelectedColumns": unsafe_selected,
        "warnings": warnings,
    }


def build_preprocessor(feature_columns: list[str]) -> ColumnTransformer:
    """Create a conservative preprocessing pipeline shared by every model."""

    numeric_features = [feature for feature in feature_columns if feature not in {"areaId"}]
    categorical_features = [feature for feature in feature_columns if feature == "areaId"]

    return ColumnTransformer(
        transformers=[
            (
                "numeric",
                Pipeline(
                    steps=[
                        ("imputer", SimpleImputer(strategy="median")),
                    ]
                ),
                numeric_features,
            ),
            (
                "categorical",
                Pipeline(
                    steps=[
                        ("imputer", SimpleImputer(strategy="most_frequent")),
                        (
                            "onehot",
                            OneHotEncoder(handle_unknown="ignore", sparse_output=False),
                        ),
                    ]
                ),
                categorical_features,
            ),
        ]
    )


def summarise_split_candidate(
    strategy: str,
    train_df: pd.DataFrame,
    test_df: pd.DataFrame,
    reason: str | None = None,
    viable_override: bool | None = None,
) -> dict[str, Any]:
    """Describe a candidate validation split in a report-friendly format."""

    viable = viable_override
    if viable is None:
        viable = bool(
            not train_df.empty
            and not test_df.empty
            and train_df[LABEL_COLUMN].nunique() >= 2
            and test_df[LABEL_COLUMN].nunique() >= 2
        )

    return {
        "strategy": strategy,
        "viable": viable,
        "reason": reason,
        "trainRows": int(len(train_df)),
        "testRows": int(len(test_df)),
        "trainPositiveCount": int((train_df[LABEL_COLUMN] == 1).sum()) if not train_df.empty else 0,
        "testPositiveCount": int((test_df[LABEL_COLUMN] == 1).sum()) if not test_df.empty else 0,
        "trainTimeRange": describe_time_range(train_df),
        "testTimeRange": describe_time_range(test_df),
    }


def split_dataset_for_validation(dataframe: pd.DataFrame) -> dict[str, Any]:
    """Build a preferred validation split and record alternative strategies."""

    usable = dataframe[dataframe[TRAINING_ELIGIBILITY_COLUMN] == 1].copy()
    usable = usable.dropna(subset=[LABEL_COLUMN]).copy()

    candidate_summaries: list[dict[str, Any]] = []
    unique_timestamps = sorted(usable[GROUP_TIMESTAMP_COLUMN].dropna().unique().tolist())
    if len(unique_timestamps) >= 10:
        cutoff_index = max(1, math.floor(len(unique_timestamps) * 0.7))
        train_timestamps = set(unique_timestamps[:cutoff_index])
        train_df = usable[usable[GROUP_TIMESTAMP_COLUMN].isin(train_timestamps)].copy()
        test_df = usable[~usable[GROUP_TIMESTAMP_COLUMN].isin(train_timestamps)].copy()
        time_candidate = summarise_split_candidate(
            "time_order_70_30",
            train_df,
            test_df,
            reason="Primary strategy for temporal realism.",
        )
    else:
        train_df = usable.iloc[0:0].copy()
        test_df = usable.iloc[0:0].copy()
        time_candidate = summarise_split_candidate(
            "time_order_70_30",
            train_df,
            test_df,
            reason="Not enough distinct timestamps for a meaningful chronological split.",
            viable_override=False,
        )
    candidate_summaries.append(time_candidate)

    random_train_df, random_test_df = stratified_split(usable)
    random_candidate = summarise_split_candidate(
        "stratified_random_70_30",
        random_train_df,
        random_test_df,
        reason="Secondary comparison only; can overestimate performance because nearby timestamps stay correlated.",
    )
    candidate_summaries.append(random_candidate)

    area_candidate = build_area_holdout_candidate(usable)
    candidate_summaries.append(area_candidate)

    event_candidate = build_event_holdout_candidate(usable)
    candidate_summaries.append(event_candidate)

    primary_candidate = next(
        (
            candidate
            for candidate in candidate_summaries
            if candidate["strategy"] == "time_order_70_30" and candidate["viable"]
        ),
        None,
    )
    selected_train_df = train_df
    selected_test_df = test_df

    if primary_candidate is None:
        primary_candidate = next(
            (
                candidate
                for candidate in candidate_summaries
                if candidate["strategy"].startswith("area_holdout_") and candidate["viable"]
            ),
            None,
        )
        if primary_candidate is not None:
            holdout_area = primary_candidate["strategy"].removeprefix("area_holdout_")
            selected_train_df = usable[usable[AREA_COLUMN] != holdout_area].copy()
            selected_test_df = usable[usable[AREA_COLUMN] == holdout_area].copy()

    if primary_candidate is None and event_candidate["viable"]:
        primary_candidate = event_candidate
        bounds = event_positive_window_bounds(usable)
        selected_train_df = usable[
            (usable[GROUP_TIMESTAMP_COLUMN] < bounds["start"])
            | (usable[GROUP_TIMESTAMP_COLUMN] > bounds["end"])
        ].copy()
        selected_test_df = usable[
            (usable[GROUP_TIMESTAMP_COLUMN] >= bounds["start"])
            & (usable[GROUP_TIMESTAMP_COLUMN] <= bounds["end"])
        ].copy()

    if primary_candidate is None:
        primary_candidate = next(
            (
                candidate
                for candidate in candidate_summaries
                if candidate["strategy"] == "stratified_random_70_30" and candidate["viable"]
            ),
            None,
        )
        selected_train_df = random_train_df
        selected_test_df = random_test_df

    validation_warnings: list[str] = []
    if primary_candidate is None:
        primary_candidate = summarise_split_candidate(
            "no_viable_split",
            selected_train_df,
            selected_test_df,
            reason="No candidate split preserved both classes in train and test.",
            viable_override=False,
        )
        validation_warnings.append(
            "No validation split preserved both classes in train and test, so model comparison is unreliable."
        )

    if primary_candidate["strategy"] != "time_order_70_30":
        validation_warnings.append(
            f"Primary evaluation fell back from time-based validation to `{primary_candidate['strategy']}`."
        )
        if primary_candidate["strategy"] == "stratified_random_70_30":
            validation_warnings.append(
                "Random split remains only a prototype reference and may overestimate performance."
            )

    if not event_candidate["viable"]:
        validation_warnings.append(
            "Event-holdout validation is not yet viable because independent elevated event labels are missing or too sparse."
        )

    return {
        "strategy": primary_candidate["strategy"],
        "train": selected_train_df,
        "test": selected_test_df,
        "trainRows": primary_candidate["trainRows"],
        "testRows": primary_candidate["testRows"],
        "trainPositiveCount": primary_candidate["trainPositiveCount"],
        "testPositiveCount": primary_candidate["testPositiveCount"],
        "trainTimeRange": primary_candidate["trainTimeRange"],
        "testTimeRange": primary_candidate["testTimeRange"],
        "candidateStrategies": candidate_summaries,
        "validationWarnings": validation_warnings,
    }


def build_area_holdout_candidate(usable: pd.DataFrame) -> dict[str, Any]:
    """Try to hold out one area entirely, if class coverage makes that meaningful."""

    areas = [area for area in sorted(usable[AREA_COLUMN].dropna().unique().tolist()) if area]
    best_candidate: dict[str, Any] | None = None

    for holdout_area in areas:
        test_df = usable[usable[AREA_COLUMN] == holdout_area].copy()
        train_df = usable[usable[AREA_COLUMN] != holdout_area].copy()
        candidate = summarise_split_candidate(
            f"area_holdout_{holdout_area}",
            train_df,
            test_df,
            reason=f"Holds out {holdout_area} entirely to test geographic generalisation.",
        )
        if candidate["viable"]:
            return candidate
        if best_candidate is None or candidate["testPositiveCount"] > best_candidate["testPositiveCount"]:
            best_candidate = candidate

    if best_candidate is not None:
        best_candidate["reason"] = (
            "Area holdout was checked, but no suburb holdout preserved both classes in train and test."
        )
        return best_candidate

    empty = usable.iloc[0:0].copy()
    return summarise_split_candidate(
        "area_holdout_unavailable",
        empty,
        empty,
        reason="Area holdout is unavailable because no stable area groups were found.",
        viable_override=False,
    )


def build_event_holdout_candidate(usable: pd.DataFrame) -> dict[str, Any]:
    """Try to build an event-style holdout when independent event labels exist."""

    if EVENT_TARGET_COLUMN not in usable.columns or EVENT_LABEL_AVAILABLE_COLUMN not in usable.columns:
        empty = usable.iloc[0:0].copy()
        return summarise_split_candidate(
            "event_holdout_unavailable",
            empty,
            empty,
            reason="Event holdout is unavailable because event-label columns are missing.",
            viable_override=False,
        )

    labelled = usable[usable[EVENT_LABEL_AVAILABLE_COLUMN].fillna(0).astype(int) == 1].copy()
    event_positive = labelled[labelled[EVENT_TARGET_COLUMN].fillna(0).astype(int) == 1].copy()
    if event_positive.empty:
        empty = usable.iloc[0:0].copy()
        return summarise_split_candidate(
            "event_holdout_unavailable",
            empty,
            empty,
            reason="No independent elevated event labels exist yet.",
            viable_override=False,
        )

    bounds = event_positive_window_bounds(usable)
    holdout_start = bounds["start"]
    holdout_end = bounds["end"]
    test_df = usable[
        (usable[GROUP_TIMESTAMP_COLUMN] >= holdout_start)
        & (usable[GROUP_TIMESTAMP_COLUMN] <= holdout_end)
    ].copy()
    train_df = usable[
        (usable[GROUP_TIMESTAMP_COLUMN] < holdout_start)
        | (usable[GROUP_TIMESTAMP_COLUMN] > holdout_end)
    ].copy()
    return summarise_split_candidate(
        "event_window_holdout",
        train_df,
        test_df,
        reason="Holds out the labelled elevated event window to test event generalisation.",
    )


def event_positive_window_bounds(usable: pd.DataFrame) -> dict[str, pd.Timestamp]:
    """Return the earliest and latest timestamps among elevated labelled-event rows."""

    labelled = usable[usable[EVENT_LABEL_AVAILABLE_COLUMN].fillna(0).astype(int) == 1].copy()
    event_positive = labelled[labelled[EVENT_TARGET_COLUMN].fillna(0).astype(int) == 1].copy()
    return {
        "start": event_positive[GROUP_TIMESTAMP_COLUMN].min(),
        "end": event_positive[GROUP_TIMESTAMP_COLUMN].max(),
    }


def stratified_split(usable: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Fallback split that preserves both classes when time order collapses them."""

    stratify = usable[LABEL_COLUMN] if usable[LABEL_COLUMN].nunique() > 1 else None
    train_df, test_df = train_test_split(
        usable,
        test_size=0.3,
        random_state=42,
        stratify=stratify,
    )
    train_df = train_df.sort_values(GROUP_TIMESTAMP_COLUMN)
    test_df = test_df.sort_values(GROUP_TIMESTAMP_COLUMN)
    return train_df, test_df


def describe_time_range(dataframe: pd.DataFrame) -> dict[str, str | None]:
    """Return a compact time-range summary for reports."""

    if dataframe.empty:
        return {"start": None, "end": None}

    start = dataframe[GROUP_TIMESTAMP_COLUMN].min()
    end = dataframe[GROUP_TIMESTAMP_COLUMN].max()
    return {
        "start": None if pd.isna(start) else start.isoformat(),
        "end": None if pd.isna(end) else end.isoformat(),
    }


def prepare_xy(dataframe: pd.DataFrame, feature_columns: list[str]) -> tuple[pd.DataFrame, pd.Series]:
    """Extract the feature matrix and target vector used by models."""

    feature_frame = dataframe[feature_columns].copy()
    target = dataframe[LABEL_COLUMN].astype(int).copy()
    return feature_frame, target


def compute_classification_metrics(
    y_true: pd.Series,
    predictions: np.ndarray,
    probabilities: np.ndarray | None = None,
) -> dict[str, Any]:
    """Compute imbalanced-friendly metrics for binary classification."""

    metrics = {
        "accuracy": float(accuracy_score(y_true, predictions)),
        "balancedAccuracy": float(balanced_accuracy_score(y_true, predictions)),
        "precision": float(precision_score(y_true, predictions, zero_division=0)),
        "recall": float(recall_score(y_true, predictions, zero_division=0)),
        "f1": float(f1_score(y_true, predictions, zero_division=0)),
        "support": {
            "negative": int((y_true == 0).sum()),
            "positive": int((y_true == 1).sum()),
        },
    }

    matrix = confusion_matrix(y_true, predictions, labels=[0, 1])
    metrics["confusionMatrix"] = {
        "labels": [0, 1],
        "values": matrix.tolist(),
    }

    if probabilities is not None and y_true.nunique() > 1:
        metrics["rocAuc"] = float(roc_auc_score(y_true, probabilities))
        metrics["prAuc"] = float(average_precision_score(y_true, probabilities))
        metrics["brierScore"] = float(brier_score_loss(y_true, probabilities))
    else:
        metrics["rocAuc"] = None
        metrics["prAuc"] = None
        metrics["brierScore"] = None

    return metrics


def confidence_band_for_probability(
    probability: float | None,
    positive_count: int,
    row_count: int,
    label_source_counts: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Translate a probability into cautious uncertainty wording."""

    if probability is None:
        return {
            "band": "unknown",
            "reason": "Probability is unavailable for this model output.",
        }

    label_source_counts = label_source_counts or {}
    if positive_count < 25:
        return {
            "band": "limited",
            "reason": "Training data has very few elevated examples, so probability should be treated cautiously.",
        }
    if set(label_source_counts.keys()) == {"rule_derived"}:
        return {
            "band": "limited",
            "reason": "Probability comes from rule-derived labels rather than independent flood outcomes.",
        }
    if probability >= 0.8 or probability <= 0.2:
        return {
            "band": "higher",
            "reason": "Probability is far from the decision boundary, but still shadow-mode only.",
        }
    if probability >= 0.65 or probability <= 0.35:
        return {
            "band": "moderate",
            "reason": "Probability is directionally useful but still sensitive to prototype label quality.",
        }
    return {
        "band": "low",
        "reason": "Probability is close to the decision boundary and should not be treated as strong evidence.",
    }


def build_prediction_preview(
    dataframe: pd.DataFrame,
    predictions: np.ndarray,
    probabilities: np.ndarray | None,
    dataset_summary: dict[str, Any],
) -> dict[str, Any] | None:
    """Build a compact preview for the latest scored row in a dataset split."""

    if dataframe.empty:
        return None

    latest_index = dataframe[GROUP_TIMESTAMP_COLUMN].idxmax()
    latest_position = dataframe.index.get_loc(latest_index)
    latest_row = dataframe.loc[latest_index]
    probability = None if probabilities is None else float(probabilities[latest_position])
    predicted_label = int(predictions[latest_position])
    confidence = confidence_band_for_probability(
        probability,
        dataset_summary.get("targetCounts", {}).get("1", 0),
        dataset_summary.get("rowCount", 0),
        dataset_summary.get("labelSourceCounts", {}),
    )

    return {
        "areaId": latest_row.get("areaId"),
        "areaName": latest_row.get("areaName"),
        "observedAt": None
        if pd.isna(latest_row.get(GROUP_TIMESTAMP_COLUMN))
        else latest_row.get(GROUP_TIMESTAMP_COLUMN).isoformat(),
        "predictedLabel": "Elevated concern" if predicted_label == 1 else "Low concern",
        "predictedProbability": None if probability is None else round(probability, 4),
        "confidenceBand": confidence["band"],
        "confidenceReason": confidence["reason"],
        "actualLabel": "Elevated concern" if int(latest_row[LABEL_COLUMN]) == 1 else "Low concern",
    }


def build_probability_bucket_summary(
    y_true: pd.Series,
    probabilities: np.ndarray | None,
) -> list[dict[str, Any]]:
    """Summarise how observed outcomes behave across coarse probability buckets."""

    if probabilities is None or y_true.nunique() <= 1:
        return []

    frame = pd.DataFrame(
        {
            "actual": y_true.astype(int).to_numpy(),
            "probability": probabilities,
        }
    )
    bins = [0.0, 0.2, 0.4, 0.6, 0.8, 1.000001]
    labels = ["0.0-0.2", "0.2-0.4", "0.4-0.6", "0.6-0.8", "0.8-1.0"]
    frame["bucket"] = pd.cut(
        frame["probability"],
        bins=bins,
        labels=labels,
        include_lowest=True,
        right=False,
    )

    summaries: list[dict[str, Any]] = []
    for label in labels:
        bucket_rows = frame[frame["bucket"] == label]
        if bucket_rows.empty:
            continue
        summaries.append(
            {
                "bucket": label,
                "rowCount": int(len(bucket_rows)),
                "meanPredictedProbability": float(bucket_rows["probability"].mean()),
                "observedPositiveRate": float(bucket_rows["actual"].mean()),
            }
        )
    return summaries


def serialise_model_artifact(path: Path, payload: dict[str, Any]) -> None:
    """Persist a trained model bundle as a joblib artifact."""

    path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(payload, path)


def extract_feature_importance(
    fitted_pipeline: Pipeline,
    model_name: str,
) -> pd.DataFrame:
    """Extract feature-importance style output from supported sklearn pipelines."""

    preprocessor = fitted_pipeline.named_steps["preprocessor"]
    estimator = fitted_pipeline.named_steps["model"]
    feature_names = preprocessor.get_feature_names_out()

    if hasattr(estimator, "feature_importances_"):
        values = estimator.feature_importances_
    elif hasattr(estimator, "coef_"):
        values = np.abs(estimator.coef_[0])
    else:
        raise ValueError(f"Model {model_name} does not expose feature importance.")

    frame = pd.DataFrame(
        {
            "feature": feature_names,
            "importance": values,
            "modelName": model_name,
        }
    ).sort_values("importance", ascending=False)
    return frame.reset_index(drop=True)


def save_feature_importance_artifacts(frame: pd.DataFrame, csv_path: Path, png_path: Path) -> None:
    """Write a CSV table and bar chart for feature-importance reporting."""

    csv_path.parent.mkdir(parents=True, exist_ok=True)
    frame.to_csv(csv_path, index=False)

    top = frame.head(12).iloc[::-1]
    plt.figure(figsize=(10, 6))
    plt.barh(top["feature"], top["importance"], color="#2c7fb8")
    plt.xlabel("Importance")
    plt.title("FloodGuard Prototype ML Feature Importance")
    plt.tight_layout()
    plt.savefig(png_path, dpi=180)
    plt.close()
