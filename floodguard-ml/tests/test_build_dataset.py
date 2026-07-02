"""Tests for FloodGuard's label-joined dataset builder."""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = PROJECT_ROOT / "src"
sys.path.insert(0, str(SRC_DIR))

from build_dataset import apply_event_labels_to_features, build_training_dataset  # noqa: E402
from utils import EVENT_TARGET_COLUMN  # noqa: E402

import pandas as pd  # noqa: E402


class BuildDatasetTests(unittest.TestCase):
    def test_apply_event_labels_to_features_matches_area_and_window(self) -> None:
        feature_rows = pd.DataFrame(
            [
                {
                    "areaId": "parramatta",
                    "areaName": "Parramatta, NSW",
                    "observedAt": "2026-06-25T03:00:00Z",
                    "targetElevatedConcern": 1,
                    "labelSource": "rule_derived",
                    "areaJoinKey": "parramatta",
                },
                {
                    "areaId": "toongabbie",
                    "areaName": "Toongabbie, NSW",
                    "observedAt": "2026-06-25T03:00:00Z",
                    "targetElevatedConcern": 0,
                    "labelSource": "rule_derived",
                    "areaJoinKey": "toongabbie",
                },
            ]
        )
        feature_rows["observedAt"] = pd.to_datetime(feature_rows["observedAt"], utc=True)
        label_rows = pd.DataFrame(
            [
                {
                    "area": "parramatta",
                    "areaJoinKey": "parramatta",
                    "start_time": pd.Timestamp("2026-06-25T00:00:00Z"),
                    "end_time": pd.Timestamp("2026-06-26T00:00:00Z"),
                    "label": 1,
                    "label_source": "warning_derived",
                    "label_strength": "moderate",
                    "notes": "Test overlap label",
                }
            ]
        )

        labelled = apply_event_labels_to_features(feature_rows, label_rows)

        self.assertEqual(int(labelled.iloc[0][EVENT_TARGET_COLUMN]), 1)
        self.assertEqual(labelled.iloc[0]["eventLabelSource"], "warning_derived")
        self.assertEqual(int(labelled.iloc[0]["eventLabelAvailable"]), 1)
        self.assertTrue(pd.isna(labelled.iloc[1][EVENT_TARGET_COLUMN]))
        self.assertEqual(int(labelled.iloc[1]["eventLabelAvailable"]), 0)

    def test_build_training_dataset_keeps_rule_target_and_writes_join_columns(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            feature_path = temp_path / "features.csv"
            labels_path = temp_path / "labels.csv"
            output_path = temp_path / "training.csv"

            pd.DataFrame(
                [
                    {
                        "areaId": "parramatta",
                        "areaName": "Parramatta, NSW",
                        "observedAt": "2026-06-25T03:00:00Z",
                        "riskScore": 51,
                        "ruleConcernLevel": "Moderate",
                        "targetElevatedConcern": 1,
                        "labelSource": "rule_derived",
                    }
                ]
            ).to_csv(feature_path, index=False)
            pd.DataFrame(
                [
                    {
                        "area": "parramatta",
                        "start_time": "2026-06-25T00:00:00Z",
                        "end_time": "2026-06-26T00:00:00Z",
                        "label": 0,
                        "label_source": "manual_demo",
                        "label_strength": "weak",
                        "notes": "Placeholder label",
                    }
                ]
            ).to_csv(labels_path, index=False)

            build_training_dataset(feature_path, labels_path, output_path)
            output = pd.read_csv(output_path)

            self.assertEqual(int(output.loc[0, "targetElevatedConcern"]), 1)
            self.assertEqual(int(output.loc[0, "targetRuleElevated"]), 1)
            self.assertEqual(int(output.loc[0, "targetEventElevated"]), 0)
            self.assertEqual(output.loc[0, "ruleLabelSource"], "rule_derived")
            self.assertEqual(output.loc[0, "eventLabelSource"], "manual_demo")
            self.assertEqual(int(output.loc[0, "eventLabelAvailable"]), 1)


if __name__ == "__main__":
    unittest.main()
