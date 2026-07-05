"""Tests for safely promoting evidence-backed backlog labels into joined supervision."""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = PROJECT_ROOT / "src"
sys.path.insert(0, str(SRC_DIR))

from promote_reviewed_labels import (  # noqa: E402
    backlog_promotion_mask,
    promote_reviewed_labels,
)

import pandas as pd  # noqa: E402


class PromoteReviewedLabelsTests(unittest.TestCase):
    def test_backlog_promotion_mask_requires_evidence_or_review_and_blocks_scenarios(self) -> None:
        backlog = pd.DataFrame(
            [
                {
                    "area": "parramatta",
                    "start_time": "2026-06-29T00:00:00Z",
                    "end_time": "2026-06-29T12:00:00Z",
                    "label_class": 1,
                    "label_source": "warning_derived",
                    "review_status": "candidate_review",
                    "join_status": "backlog_only",
                    "evidence_link": "https://example.test/evidence",
                },
                {
                    "area": "toongabbie",
                    "start_time": "2026-06-30T00:00:00Z",
                    "end_time": "2026-06-30T06:00:00Z",
                    "label_class": 1,
                    "label_source": "scenario_generated",
                    "review_status": "reviewed_for_shadow_mode",
                    "join_status": "backlog_only",
                    "evidence_link": "https://example.test/scenario",
                },
                {
                    "area": "north-parramatta",
                    "start_time": "2026-07-01T00:00:00Z",
                    "end_time": "2026-07-01T06:00:00Z",
                    "label_class": 1,
                    "label_source": "impact_candidate",
                    "review_status": "candidate_review",
                    "join_status": "backlog_only",
                    "evidence_link": "",
                },
            ]
        )

        mask = backlog_promotion_mask(backlog)

        self.assertEqual(mask.tolist(), [True, False, False])

    def test_promote_reviewed_labels_upserts_evidence_backed_rows_without_claiming_review(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            backlog_path = temp_path / "event_label_backlog.csv"
            labels_path = temp_path / "labels.csv"
            dataset_path = temp_path / "training.csv"

            pd.DataFrame(
                [
                    {
                        "area": "parramatta",
                        "start_time": "2026-06-24T00:00:00Z",
                        "end_time": "2026-07-02T00:00:00Z",
                        "label": 0,
                        "label_source": "manual_demo",
                        "label_strength": "weak",
                        "review_status": "scaffold_only",
                        "evidence_link": "",
                        "notes": "Baseline label",
                    }
                ]
            ).to_csv(labels_path, index=False)
            pd.DataFrame(
                [
                    {
                        "area": "parramatta",
                        "event_name": "Candidate elevated warning window for review",
                        "start_time": "2026-06-29T00:00:00Z",
                        "end_time": "2026-06-29T12:00:00Z",
                        "label_class": 1,
                        "label_source": "warning_derived",
                        "label_strength": "moderate",
                        "review_status": "candidate_review",
                        "promotion_ready": "no",
                        "independence_level": "moderate",
                        "review_priority": "high",
                        "join_status": "backlog_only",
                        "evidence_link": "https://example.test/floodguard/labels/parramatta-warning-window",
                        "notes": "Candidate warning-linked window reserved for future evidence review.",
                    }
                ]
            ).to_csv(backlog_path, index=False)

            with patch("promote_reviewed_labels.build_training_dataset") as build_dataset_mock, patch(
                "promote_reviewed_labels.write_label_audit_artifacts",
                return_value={
                    "labelsSummary": {"reviewedRows": 0, "reviewedPositiveRows": 0},
                    "backlogSummary": {},
                },
            ), patch(
                "promote_reviewed_labels.run_evaluation",
                return_value=[
                    {"datasetName": "real_export"},
                    {"datasetName": "scenario_stress_test"},
                ],
            ), patch("promote_reviewed_labels.write_model_card"), patch(
                "promote_reviewed_labels.run_calibration",
                return_value={"target": {"kind": "rule"}},
            ):
                result = promote_reviewed_labels(
                    backlog_path=backlog_path,
                    labels_path=labels_path,
                    dataset_path=dataset_path,
                )

            promoted_labels = pd.read_csv(labels_path)
            updated_backlog = pd.read_csv(backlog_path)

        self.assertEqual(result["promotedCount"], 1)
        self.assertEqual(result["reviewedEventWindows"], 0)
        self.assertEqual(result["reviewedElevatedEventWindows"], 0)
        self.assertEqual(promoted_labels["label"].tolist(), [0, 1])
        self.assertIn("review_notes", promoted_labels.columns)
        self.assertEqual(
            promoted_labels.loc[promoted_labels["label"] == 1, "review_status"].iloc[0],
            "candidate_review",
        )
        self.assertEqual(
            updated_backlog.loc[0, "join_status"],
            "joined_to_labels",
        )
        self.assertEqual(updated_backlog.loc[0, "promotion_ready"], "promoted")
        build_dataset_mock.assert_called_once()


if __name__ == "__main__":
    unittest.main()
