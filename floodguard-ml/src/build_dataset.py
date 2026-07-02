"""Build or refresh local ML-ready datasets used by the Python pipeline."""

from __future__ import annotations

from pathlib import Path

from utils import (
    DEFAULT_DATASET,
    EVENT_LABEL_AVAILABLE_COLUMN,
    EVENT_LABEL_NOTES_COLUMN,
    EVENT_LABEL_SOURCE_COLUMN,
    EVENT_LABEL_STRENGTH_COLUMN,
    EVENT_TARGET_COLUMN,
    FEATURE_EXPORT_DATASET,
    GROUP_TIMESTAMP_COLUMN,
    LABELS_DATASET,
    RULE_LABEL_SOURCE_COLUMN,
    RULE_TARGET_COLUMN,
    SCENARIO_DATASET,
    ensure_runtime_dirs,
)

import pandas as pd


def normalise_area_id(value: str) -> str:
    """Reduce area labels into a stable key for label joins."""

    return str(value).strip().lower().replace(" ", "-")


def load_feature_export(feature_path: Path = FEATURE_EXPORT_DATASET) -> pd.DataFrame:
    """Load the Node-exported feature rows and prepare stable join fields."""

    dataframe = pd.read_csv(feature_path)
    if dataframe.empty:
        return dataframe

    dataframe[GROUP_TIMESTAMP_COLUMN] = pd.to_datetime(
        dataframe[GROUP_TIMESTAMP_COLUMN], errors="coerce", utc=True
    )
    dataframe["areaJoinKey"] = dataframe["areaId"].map(normalise_area_id)
    dataframe[RULE_TARGET_COLUMN] = (
        pd.to_numeric(dataframe["targetElevatedConcern"], errors="coerce").fillna(0).astype(int)
    )
    if "labelSource" in dataframe.columns:
        dataframe[RULE_LABEL_SOURCE_COLUMN] = dataframe["labelSource"].fillna("rule_derived")
    else:
        dataframe[RULE_LABEL_SOURCE_COLUMN] = "rule_derived"
    return dataframe


def load_label_windows(labels_path: Path = LABELS_DATASET) -> pd.DataFrame:
    """Load time-window labels or return an empty frame when none are available yet."""

    if not labels_path.exists():
        return pd.DataFrame(
            columns=[
                "area",
                "start_time",
                "end_time",
                "label",
                "label_source",
                "label_strength",
                "notes",
            ]
        )

    labels = pd.read_csv(labels_path)
    if labels.empty:
        return labels

    labels["areaJoinKey"] = labels["area"].map(normalise_area_id)
    labels["start_time"] = pd.to_datetime(labels["start_time"], errors="coerce", utc=True)
    labels["end_time"] = pd.to_datetime(labels["end_time"], errors="coerce", utc=True)
    labels["label"] = pd.to_numeric(labels["label"], errors="coerce")
    return labels


def apply_event_labels_to_features(
    feature_rows: pd.DataFrame, label_rows: pd.DataFrame
) -> pd.DataFrame:
    """Join the strongest matching event label onto each feature row."""

    dataframe = feature_rows.copy()
    dataframe[EVENT_TARGET_COLUMN] = pd.NA
    dataframe[EVENT_LABEL_SOURCE_COLUMN] = pd.NA
    dataframe[EVENT_LABEL_STRENGTH_COLUMN] = pd.NA
    dataframe[EVENT_LABEL_NOTES_COLUMN] = pd.NA
    dataframe[EVENT_LABEL_AVAILABLE_COLUMN] = 0

    if dataframe.empty or label_rows.empty:
        return dataframe

    strength_rank = {"strong": 3, "moderate": 2, "weak": 1}
    ordered_labels = label_rows.copy()
    ordered_labels["strengthRank"] = ordered_labels["label_strength"].map(strength_rank).fillna(0)
    ordered_labels = ordered_labels.sort_values(
        by=["strengthRank", "start_time"], ascending=[False, True]
    )

    for index, row in dataframe.iterrows():
        matches = ordered_labels[
            (ordered_labels["areaJoinKey"] == row["areaJoinKey"])
            & (ordered_labels["start_time"] <= row[GROUP_TIMESTAMP_COLUMN])
            & (ordered_labels["end_time"] >= row[GROUP_TIMESTAMP_COLUMN])
        ]
        if matches.empty:
            continue

        best_match = matches.iloc[0]
        dataframe.at[index, EVENT_TARGET_COLUMN] = int(best_match["label"])
        dataframe.at[index, EVENT_LABEL_SOURCE_COLUMN] = best_match["label_source"]
        dataframe.at[index, EVENT_LABEL_STRENGTH_COLUMN] = best_match["label_strength"]
        dataframe.at[index, EVENT_LABEL_NOTES_COLUMN] = best_match["notes"]
        dataframe.at[index, EVENT_LABEL_AVAILABLE_COLUMN] = 1

    return dataframe


def build_training_dataset(
    feature_path: Path = FEATURE_EXPORT_DATASET,
    labels_path: Path = LABELS_DATASET,
    output_path: Path = DEFAULT_DATASET,
) -> Path:
    """Join time-window labels onto the feature export and write the training dataset."""

    ensure_runtime_dirs()
    feature_rows = load_feature_export(feature_path)
    labelled_rows = apply_event_labels_to_features(feature_rows, load_label_windows(labels_path))

    if not labelled_rows.empty:
        labelled_rows["targetElevatedConcern"] = labelled_rows[RULE_TARGET_COLUMN]
        labelled_rows["labelSource"] = labelled_rows[RULE_LABEL_SOURCE_COLUMN]

    output_path.write_text(labelled_rows.to_csv(index=False), encoding="utf-8")
    return output_path


def build_scenario_dataset(output_path: Path = SCENARIO_DATASET) -> Path:
    """Create a balanced scenario dataset for stress-testing the ML pipeline.

    This dataset is synthetic and must never be presented as real-world validation.
    It exists so the pipeline can exercise multi-signal flood patterns and show that
    the modelling/reporting stack works on a less collapsed class mix.
    """

    ensure_runtime_dirs()
    rows = []
    areas = [
        ("parramatta", "Parramatta, NSW"),
        ("north-parramatta", "North Parramatta, NSW"),
        ("toongabbie", "Toongabbie, NSW"),
    ]

    def add_rows(
        scenario_name: str,
        count: int,
        rule_level: str,
        target: int,
        base_values: dict,
        training_eligibility: int = 1,
    ) -> None:
        for index in range(count):
            area_id, area_name = areas[index % len(areas)]
            rows.append(
                {
                    "areaId": area_id,
                    "areaName": area_name,
                    "observedAt": f"2026-07-{1 + index // 6:02d}T{index % 24:02d}:00:00Z",
                    "riskScore": base_values["riskScore"] + (index % 3),
                    "ruleConcernLevel": rule_level,
                    "targetElevatedConcern": target,
                    "targetRuleElevated": target,
                    "targetEventElevated": target,
                    "labelSource": "scenario_generated",
                    "ruleLabelSource": "scenario_generated",
                    "eventLabelSource": "scenario_generated",
                    "eventLabelStrength": "synthetic",
                    "eventLabelNotes": "Synthetic scenario row for ML plumbing only.",
                    "eventLabelAvailable": 1,
                    "rainfallLatestMm": base_values["rainfallLatestMm"] + (index % 2),
                    "rainfall1hMm": base_values["rainfall1hMm"] + (index % 3),
                    "rainfall3hMm": base_values["rainfall3hMm"] + (index % 5),
                    "rainfall24hMm": base_values["rainfall24hMm"] + (index % 7),
                    "rainfall72hMm": base_values["rainfall72hMm"] + (index % 11),
                    "antecedentWetnessMm": base_values["antecedentWetnessMm"] + (index % 9),
                    "antecedentRainfallIndex": base_values["antecedentRainfallIndex"],
                    "riverLatestM": base_values["riverLatestM"] + ((index % 4) * 0.01),
                    "riverDelta1hM": base_values["riverDelta1hM"],
                    "riverDelta3hM": base_values["riverDelta3hM"],
                    "riverTrendCode": base_values["riverTrendCode"],
                    "rateOfRiseMPerHour": base_values["rateOfRiseMPerHour"],
                    "dataFreshnessScore": base_values["dataFreshnessScore"],
                    "sourceCoverage": base_values["sourceCoverage"],
                    "decisionReliabilityScore": base_values["decisionReliabilityScore"],
                    "confidence": base_values["confidence"],
                    "warningActive": base_values["warningActive"],
                    "warningStatus": base_values["warningStatus"],
                    "areaRelevanceScore": base_values["areaRelevanceScore"],
                    "nearestStationDistanceKm": base_values["nearestStationDistanceKm"],
                    "scenarioName": scenario_name,
                    "trainingEligibility": training_eligibility,
                }
            )

    add_rows(
        "low_stable",
        36,
        "Low",
        0,
        {
            "riskScore": 14,
            "rainfallLatestMm": 0.6,
            "rainfall1hMm": 1.2,
            "rainfall3hMm": 2.4,
            "rainfall24hMm": 6.5,
            "rainfall72hMm": 15.0,
            "antecedentWetnessMm": 18.0,
            "antecedentRainfallIndex": 0.14,
            "riverLatestM": 0.55,
            "riverDelta1hM": 0.0,
            "riverDelta3hM": 0.01,
            "riverTrendCode": 0,
            "rateOfRiseMPerHour": 0.0,
            "dataFreshnessScore": 96,
            "sourceCoverage": 0.95,
            "decisionReliabilityScore": 91,
            "confidence": 0.93,
            "warningActive": 0,
            "warningStatus": "no_current_warning",
            "areaRelevanceScore": 98,
            "nearestStationDistanceKm": 0.7,
        },
    )
    add_rows(
        "high_short_rain",
        24,
        "Moderate",
        1,
        {
            "riskScore": 49,
            "rainfallLatestMm": 9.0,
            "rainfall1hMm": 14.0,
            "rainfall3hMm": 18.0,
            "rainfall24hMm": 24.0,
            "rainfall72hMm": 42.0,
            "antecedentWetnessMm": 45.0,
            "antecedentRainfallIndex": 0.44,
            "riverLatestM": 0.76,
            "riverDelta1hM": 0.03,
            "riverDelta3hM": 0.05,
            "riverTrendCode": 0,
            "rateOfRiseMPerHour": 0.03,
            "dataFreshnessScore": 94,
            "sourceCoverage": 0.9,
            "decisionReliabilityScore": 88,
            "confidence": 0.81,
            "warningActive": 0,
            "warningStatus": "no_current_warning",
            "areaRelevanceScore": 96,
            "nearestStationDistanceKm": 0.8,
        },
    )
    add_rows(
        "rising_river_peak",
        24,
        "High",
        1,
        {
            "riskScore": 72,
            "rainfallLatestMm": 16.0,
            "rainfall1hMm": 19.0,
            "rainfall3hMm": 28.0,
            "rainfall24hMm": 44.0,
            "rainfall72hMm": 78.0,
            "antecedentWetnessMm": 86.0,
            "antecedentRainfallIndex": 0.72,
            "riverLatestM": 1.12,
            "riverDelta1hM": 0.17,
            "riverDelta3hM": 0.28,
            "riverTrendCode": 1,
            "rateOfRiseMPerHour": 0.17,
            "dataFreshnessScore": 92,
            "sourceCoverage": 0.92,
            "decisionReliabilityScore": 85,
            "confidence": 0.79,
            "warningActive": 1,
            "warningStatus": "watch_and_act",
            "areaRelevanceScore": 97,
            "nearestStationDistanceKm": 0.6,
        },
    )
    add_rows(
        "stale_source_blocked",
        12,
        "High",
        1,
        {
            "riskScore": 74,
            "rainfallLatestMm": 15.0,
            "rainfall1hMm": 20.0,
            "rainfall3hMm": 30.0,
            "rainfall24hMm": 48.0,
            "rainfall72hMm": 82.0,
            "antecedentWetnessMm": 90.0,
            "antecedentRainfallIndex": 0.75,
            "riverLatestM": 1.2,
            "riverDelta1hM": 0.18,
            "riverDelta3hM": 0.31,
            "riverTrendCode": 1,
            "rateOfRiseMPerHour": 0.18,
            "dataFreshnessScore": 18,
            "sourceCoverage": 0.22,
            "decisionReliabilityScore": 21,
            "confidence": 0.28,
            "warningActive": 0,
            "warningStatus": "source_blocked",
            "areaRelevanceScore": 95,
            "nearestStationDistanceKm": 0.8,
        },
        training_eligibility=0,
    )

    dataframe = pd.DataFrame(rows)
    output_path.write_text(dataframe.to_csv(index=False), encoding="utf-8")
    return output_path


def main() -> None:
    ensure_runtime_dirs()
    training_path = build_training_dataset()
    scenario_path = build_scenario_dataset()
    print("ML dataset builder ready.")
    print(f"Feature export: {FEATURE_EXPORT_DATASET}")
    print(f"Label-joined training dataset: {training_path}")
    print(f"Scenario stress-test export: {scenario_path}")
    print("Next step: run evaluate.py to train the prototype models and generate reports.")


if __name__ == "__main__":
    main()
