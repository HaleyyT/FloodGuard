"""Tests for FloodGuard's ML validation and leakage-control helpers."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = PROJECT_ROOT / "src"
sys.path.insert(0, str(SRC_DIR))

from utils import (  # noqa: E402
        EVENT_LABEL_AVAILABLE_COLUMN,
        EVENT_LABEL_EVIDENCE_LINK_COLUMN,
        EVENT_LABEL_REVIEW_STATUS_COLUMN,
        EVENT_LABEL_SOURCE_COLUMN,
        EVENT_LABEL_STRENGTH_COLUMN,
    EVENT_TARGET_COLUMN,
    GROUP_TIMESTAMP_COLUMN,
    LABEL_COLUMN,
    RULE_LABEL_SOURCE_COLUMN,
    apply_training_target_selection,
    assess_leakage_controls,
    build_probability_bucket_summary,
    choose_training_target,
    confidence_band_for_probability,
    feature_columns_for_training,
    split_dataset_for_validation,
)

import pandas as pd  # noqa: E402


def make_row(
    observed_at: str,
    label: int,
    area_id: str = "parramatta",
    event_label: int | None = None,
    event_available: int = 0,
) -> dict:
    """Build a compact row for validation tests."""

    row = {
        "areaId": area_id,
        "areaName": f"{area_id.title()}, NSW",
        "observedAt": observed_at,
        "targetElevatedConcern": label,
        "labelSource": "rule_derived",
        RULE_LABEL_SOURCE_COLUMN: "rule_derived",
        "ruleConcernLevel": "Moderate" if label else "Low",
        "rainfallLatestMm": 3 + label,
        "rainfall1hMm": 5 + label,
        "rainfall3hMm": 8 + label,
        "rainfall24hMm": 12 + label,
        "rainfall72hMm": 18 + label,
        "antecedentWetnessMm": 20 + label,
        "antecedentRainfallIndex": 0.2 + (label * 0.1),
        "riverLatestM": 0.6 + (label * 0.2),
        "riverDelta1hM": 0.01 + (label * 0.05),
        "riverDelta3hM": 0.02 + (label * 0.08),
        "riverTrendCode": label,
        "rateOfRiseMPerHour": 0.01 + (label * 0.05),
        "dataFreshnessScore": 92,
        "sourceCoverage": 0.95,
        "warningActive": label,
        "areaRelevanceScore": 98,
        "nearestStationDistanceKm": 0.5,
        "trainingEligibility": 1,
        EVENT_TARGET_COLUMN: event_label,
        EVENT_LABEL_AVAILABLE_COLUMN: event_available,
        EVENT_LABEL_SOURCE_COLUMN: "warning_derived" if event_available else None,
        EVENT_LABEL_STRENGTH_COLUMN: "moderate" if event_available else None,
        EVENT_LABEL_REVIEW_STATUS_COLUMN: "candidate_review" if event_available else None,
        EVENT_LABEL_EVIDENCE_LINK_COLUMN: None,
        "riskScore": 65 if label else 15,
    }
    return row


class ValidationControlTests(unittest.TestCase):
    def test_split_prefers_time_order_when_both_classes_survive(self) -> None:
        rows = []
        for index in range(12):
            label = 1 if index in {2, 5, 8, 10} else 0
            rows.append(
                make_row(
                    f"2026-06-2{index // 4}T0{index % 4}:00:00Z",
                    label,
                    area_id="parramatta" if index % 2 == 0 else "toongabbie",
                )
            )

        frame = pd.DataFrame(rows)
        frame[GROUP_TIMESTAMP_COLUMN] = pd.to_datetime(frame[GROUP_TIMESTAMP_COLUMN], utc=True)

        result = split_dataset_for_validation(frame)

        self.assertEqual(result["strategy"], "time_order_70_30")
        self.assertGreaterEqual(result["trainPositiveCount"], 1)
        self.assertGreaterEqual(result["testPositiveCount"], 1)

    def test_split_falls_back_to_random_when_time_order_would_collapse_classes(self) -> None:
        rows = []
        for index in range(10):
            rows.append(make_row(f"2026-06-25T0{index % 5}:00:00Z", 0))
        rows.append(make_row("2026-06-26T00:00:00Z", 1))
        rows.append(make_row("2026-06-26T01:00:00Z", 1))

        frame = pd.DataFrame(rows)
        frame[GROUP_TIMESTAMP_COLUMN] = pd.to_datetime(frame[GROUP_TIMESTAMP_COLUMN], utc=True)

        result = split_dataset_for_validation(frame)

        self.assertEqual(result["strategy"], "stratified_random_70_30")
        self.assertTrue(
            any("fell back from time-based validation" in warning for warning in result["validationWarnings"])
        )

    def test_split_prefers_area_holdout_before_random_when_viable(self) -> None:
        rows = []
        for index in range(12):
            label = 1 if index >= 8 else 0
            area_id = "parramatta" if index % 3 == 0 else "north-parramatta"
            rows.append(make_row(f"2026-06-2{index // 4}T0{index % 4}:00:00Z", label, area_id=area_id))

        frame = pd.DataFrame(rows)
        frame[GROUP_TIMESTAMP_COLUMN] = pd.to_datetime(frame[GROUP_TIMESTAMP_COLUMN], utc=True)

        result = split_dataset_for_validation(frame)

        self.assertTrue(result["strategy"].startswith("area_holdout_"))
        self.assertTrue(
            any("fell back from time-based validation" in warning for warning in result["validationWarnings"])
        )

    def test_leakage_controls_report_reference_only_columns(self) -> None:
        frame = pd.DataFrame(
            [
                make_row("2026-06-25T00:00:00Z", 0),
                make_row("2026-06-25T01:00:00Z", 1),
            ]
        )
        feature_columns, _, _ = feature_columns_for_training(frame)
        leakage = assess_leakage_controls(frame, feature_columns)

        self.assertIn("riskScore", leakage["presentReferenceOnlyColumns"])
        self.assertIn("targetElevatedConcern", leakage["blockedFromTraining"])
        self.assertEqual(leakage["unsafeSelectedColumns"], [])

    def test_confidence_band_stays_limited_when_elevated_examples_are_sparse(self) -> None:
        band = confidence_band_for_probability(0.87, positive_count=8, row_count=3000, label_source_counts={"rule_derived": 3000})
        self.assertEqual(band["band"], "limited")
        self.assertIn("few elevated examples", band["reason"])

    def test_probability_bucket_summary_groups_rows(self) -> None:
        y_true = pd.Series([0, 0, 1, 1])
        probabilities = pd.Series([0.1, 0.35, 0.62, 0.91]).to_numpy()
        buckets = build_probability_bucket_summary(y_true, probabilities)

        self.assertGreaterEqual(len(buckets), 3)
        self.assertEqual(buckets[0]["bucket"], "0.0-0.2")

    def test_target_selection_falls_back_to_rule_when_event_labels_are_too_weak(self) -> None:
        frame = pd.DataFrame(
            [
                make_row(
                    f"2026-06-25T0{index % 6}:00:00Z",
                    1 if index in {2, 5} else 0,
                    event_label=0,
                    event_available=1,
                )
                for index in range(12)
            ]
        )
        frame[GROUP_TIMESTAMP_COLUMN] = pd.to_datetime(frame[GROUP_TIMESTAMP_COLUMN], utc=True)
        frame[EVENT_LABEL_STRENGTH_COLUMN] = "weak"

        selection = choose_training_target(frame)

        self.assertEqual(selection["selectedTargetKind"], "rule")
        self.assertIn("only 12 event-labelled row(s)", selection["reason"])

    def test_target_selection_uses_event_target_when_labelled_rows_are_viable(self) -> None:
        rows = []
        for index in range(40):
            label = 1 if index in {5, 8, 11, 15, 19, 23, 27, 32, 35, 38} else 0
            rows.append(
                make_row(
                    f"2026-06-{1 + (index // 6):02d}T{index % 6:02d}:00:00Z",
                    label,
                    area_id="parramatta" if index % 2 == 0 else "toongabbie",
                    event_label=label,
                    event_available=1,
                )
            )

        frame = pd.DataFrame(rows)
        frame[GROUP_TIMESTAMP_COLUMN] = pd.to_datetime(frame[GROUP_TIMESTAMP_COLUMN], utc=True)
        frame[EVENT_LABEL_STRENGTH_COLUMN] = "moderate"
        frame[EVENT_LABEL_REVIEW_STATUS_COLUMN] = "reviewed_for_shadow_mode"

        selection = choose_training_target(frame)
        projected = apply_training_target_selection(frame, selection)

        self.assertEqual(selection["selectedTargetKind"], "event")
        self.assertEqual(selection["selectedTargetColumn"], EVENT_TARGET_COLUMN)
        self.assertEqual(selection["reviewedRowCount"], 40)
        self.assertEqual(int(projected[LABEL_COLUMN].sum()), 10)

    def test_target_selection_rejects_candidate_review_labels_even_when_counts_are_large(self) -> None:
        rows = []
        for index in range(40):
            label = 1 if index in {5, 8, 11, 15, 19, 23, 27, 32, 35, 38} else 0
            rows.append(
                make_row(
                    f"2026-06-{1 + (index // 6):02d}T{index % 6:02d}:00:00Z",
                    label,
                    area_id="parramatta" if index % 2 == 0 else "toongabbie",
                    event_label=label,
                    event_available=1,
                )
            )

        frame = pd.DataFrame(rows)
        frame[GROUP_TIMESTAMP_COLUMN] = pd.to_datetime(frame[GROUP_TIMESTAMP_COLUMN], utc=True)
        frame[EVENT_LABEL_STRENGTH_COLUMN] = "moderate"
        frame[EVENT_LABEL_REVIEW_STATUS_COLUMN] = "candidate_review"

        selection = choose_training_target(frame)

        self.assertEqual(selection["selectedTargetKind"], "rule")
        self.assertIn("evidence-linked or explicitly reviewed", selection["reason"])

    def test_target_selection_rejects_weak_evidence_linked_rows_for_independent_supervision(self) -> None:
        rows = []
        for index in range(40):
            label = 1 if index in {5, 8, 11, 15, 19, 23, 27, 32, 35, 38} else 0
            row = make_row(
                f"2026-06-{1 + (index // 6):02d}T{index % 6:02d}:00:00Z",
                label,
                area_id="parramatta" if index % 2 == 0 else "toongabbie",
                event_label=label,
                event_available=1,
            )
            row[EVENT_LABEL_EVIDENCE_LINK_COLUMN] = f"https://example.test/event/{index}"
            rows.append(row)

        frame = pd.DataFrame(rows)
        frame[GROUP_TIMESTAMP_COLUMN] = pd.to_datetime(frame[GROUP_TIMESTAMP_COLUMN], utc=True)
        frame[EVENT_LABEL_STRENGTH_COLUMN] = "weak"
        frame[EVENT_LABEL_REVIEW_STATUS_COLUMN] = "candidate_review"

        selection = choose_training_target(frame)

        self.assertEqual(selection["selectedTargetKind"], "rule")
        self.assertIn("weak-strength supervision", selection["reason"])

    def test_event_holdout_reports_exact_review_gate_failure(self) -> None:
        rows = []
        for index in range(12):
            label = 1 if index in {4, 8} else 0
            rows.append(
                make_row(
                    f"2026-06-{1 + (index // 4):02d}T0{index % 4}:00:00Z",
                    label,
                    area_id="parramatta" if index % 2 == 0 else "toongabbie",
                    event_label=label,
                    event_available=1,
                )
            )

        frame = pd.DataFrame(rows)
        frame[GROUP_TIMESTAMP_COLUMN] = pd.to_datetime(frame[GROUP_TIMESTAMP_COLUMN], utc=True)
        frame[EVENT_LABEL_STRENGTH_COLUMN] = "moderate"
        frame[EVENT_LABEL_REVIEW_STATUS_COLUMN] = "candidate_review"

        split = split_dataset_for_validation(frame)
        event_candidate = next(
            candidate
            for candidate in split["candidateStrategies"]
            if candidate["strategy"] == "event_holdout_unavailable"
        )

        self.assertFalse(event_candidate["viable"])
        self.assertEqual(event_candidate["reviewedEventWindows"], 0)
        self.assertEqual(event_candidate["reviewedElevatedEventWindows"], 0)
        self.assertIn("reviewedEventWindows < 2", event_candidate["reason"])


if __name__ == "__main__":
    unittest.main()
