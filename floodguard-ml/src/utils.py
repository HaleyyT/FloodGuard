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


def feature_columns_for_training(dataframe: pd.DataFrame) -> tuple[list[str], list[str]]:
    """Choose trainable features and record any columns that are entirely missing."""

    selected = [column for column in FEATURE_COLUMNS if column in dataframe.columns and not dataframe[column].isna().all()]
    dropped = [column for column in FEATURE_COLUMNS if column not in selected]
    return selected, dropped


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


def split_dataset_for_time_order(dataframe: pd.DataFrame) -> dict[str, Any]:
    """Split by timestamp groups first, with a safer fallback if time order is unusable."""

    usable = dataframe[dataframe[TRAINING_ELIGIBILITY_COLUMN] == 1].copy()
    usable = usable.dropna(subset=[LABEL_COLUMN]).copy()

    unique_timestamps = sorted(usable[GROUP_TIMESTAMP_COLUMN].dropna().unique().tolist())
    if len(unique_timestamps) >= 10:
        cutoff_index = max(1, math.floor(len(unique_timestamps) * 0.7))
        train_timestamps = set(unique_timestamps[:cutoff_index])
        train_df = usable[usable[GROUP_TIMESTAMP_COLUMN].isin(train_timestamps)].copy()
        test_df = usable[~usable[GROUP_TIMESTAMP_COLUMN].isin(train_timestamps)].copy()
        strategy = "time_order_70_30"
    else:
        train_df, test_df = stratified_split(usable)
        strategy = "stratified_random_70_30"

    if (
        usable[LABEL_COLUMN].nunique() > 1
        and (train_df[LABEL_COLUMN].nunique() < 2 or test_df[LABEL_COLUMN].nunique() < 2)
    ):
        train_df, test_df = stratified_split(usable)
        strategy = "stratified_random_fallback_from_time_order"

    return {
        "strategy": strategy,
        "train": train_df,
        "test": test_df,
        "trainRows": int(len(train_df)),
        "testRows": int(len(test_df)),
        "trainPositiveCount": int((train_df[LABEL_COLUMN] == 1).sum()),
        "testPositiveCount": int((test_df[LABEL_COLUMN] == 1).sum()),
        "trainTimeRange": describe_time_range(train_df),
        "testTimeRange": describe_time_range(test_df),
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
    else:
        metrics["rocAuc"] = None
        metrics["prAuc"] = None

    return metrics


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
