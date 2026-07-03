"""Tests for FloodGuard's threshold calibration workbench."""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = PROJECT_ROOT / "src"
sys.path.insert(0, str(SRC_DIR))

from calibrate_thresholds import (  # noqa: E402
    build_threshold_grid,
    evaluate_threshold_candidate,
    load_threshold_config,
    row_trigger_state,
    target_metadata,
)

import pandas as pd  # noqa: E402


class CalibrateThresholdsTests(unittest.TestCase):
    def test_row_trigger_state_suppresses_degraded_source_rows(self) -> None:
        thresholds = {
            "rainfall1hMm": 10.0,
            "rainfall3hMm": 20.0,
            "rainfall24hMm": 50.0,
            "rainfall72hMm": 80.0,
            "riverRise1hM": 0.15,
            "riverRise3hM": 0.3,
            "minimumCoreCoverage": 0.7,
        }
        row = {
            "rainfall1hMm": 12.0,
            "rainfall3hMm": 14.0,
            "rainfall24hMm": 20.0,
            "rainfall72hMm": 30.0,
            "riverDelta1hM": 0.01,
            "riverDelta3hM": 0.01,
            "sourceCoverage": 0.55,
            "dataFreshnessScore": 88,
        }

        state = row_trigger_state(row, thresholds)

        self.assertTrue(state["rawTriggered"])
        self.assertTrue(state["degradedSource"])
        self.assertTrue(state["suppressedByDegradedSource"])
        self.assertEqual(state["predictedElevated"], 0)

    def test_target_metadata_falls_back_to_rule_reference_without_positive_event_labels(self) -> None:
        frame = pd.DataFrame(
            [
                {
                    "targetElevatedConcern": 1,
                    "targetRuleElevated": 1,
                    "targetEventElevated": 0,
                    "eventLabelAvailable": 1,
                },
                {
                    "targetElevatedConcern": 0,
                    "targetRuleElevated": 0,
                    "targetEventElevated": 0,
                    "eventLabelAvailable": 1,
                },
            ]
        )

        target = target_metadata(frame)

        self.assertEqual(target["kind"], "rule_reference")
        self.assertIn("Independent elevated event labels are unavailable", target["reason"])

    def test_evaluate_threshold_candidate_reports_window_detection_metrics(self) -> None:
        thresholds = {
            "rainfall1hMm": 10.0,
            "rainfall3hMm": 20.0,
            "rainfall24hMm": 50.0,
            "rainfall72hMm": 80.0,
            "riverRise1hM": 0.15,
            "riverRise3hM": 0.3,
            "minimumCoreCoverage": 0.7,
        }
        frame = pd.DataFrame(
            [
                {
                    "areaId": "parramatta",
                    "observedAt": "2026-07-01T00:00:00Z",
                    "targetRuleElevated": 1,
                    "rainfall1hMm": 12.0,
                    "rainfall3hMm": 16.0,
                    "rainfall24hMm": 30.0,
                    "rainfall72hMm": 45.0,
                    "riverDelta1hM": 0.01,
                    "riverDelta3hM": 0.02,
                    "sourceCoverage": 0.9,
                    "dataFreshnessScore": 90,
                },
                {
                    "areaId": "parramatta",
                    "observedAt": "2026-07-01T01:00:00Z",
                    "targetRuleElevated": 1,
                    "rainfall1hMm": 13.0,
                    "rainfall3hMm": 18.0,
                    "rainfall24hMm": 32.0,
                    "rainfall72hMm": 46.0,
                    "riverDelta1hM": 0.02,
                    "riverDelta3hM": 0.03,
                    "sourceCoverage": 0.9,
                    "dataFreshnessScore": 91,
                },
                {
                    "areaId": "parramatta",
                    "observedAt": "2026-07-01T06:00:00Z",
                    "targetRuleElevated": 0,
                    "rainfall1hMm": 1.0,
                    "rainfall3hMm": 2.0,
                    "rainfall24hMm": 4.0,
                    "rainfall72hMm": 10.0,
                    "riverDelta1hM": 0.0,
                    "riverDelta3hM": 0.0,
                    "sourceCoverage": 0.95,
                    "dataFreshnessScore": 95,
                },
            ]
        )
        frame["observedAt"] = pd.to_datetime(frame["observedAt"], utc=True)

        metrics = evaluate_threshold_candidate(frame, thresholds, "targetRuleElevated")

        self.assertEqual(metrics["tp"], 2)
        self.assertEqual(metrics["fp"], 0)
        self.assertEqual(metrics["detectedEventWindows"], 1)
        self.assertEqual(metrics["missedEventWindows"], 0)
        self.assertEqual(metrics["timeToDetectionHours"], 0.0)

    def test_build_threshold_grid_includes_current_config_value(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir) / "risk-thresholds.json"
            temp_path.write_text(
                """
                {
                  "defaults": {
                    "rainfall": {
                      "oneHourConcernMm": 10,
                      "threeHourConcernMm": 20,
                      "twentyFourHourConcernMm": 50,
                      "seventyTwoHourWetnessMm": 80
                    },
                    "river": {
                      "rapidRiseOneHourM": 0.15,
                      "rapidRiseThreeHourM": 0.3,
                      "steadyDeltaM": 0.02
                    },
                    "confidence": {
                      "minimumCoreCoverage": 0.7
                    }
                  }
                }
                """.strip()
                + "\n",
                encoding="utf-8",
            )
            config = load_threshold_config(temp_path)

        grid = build_threshold_grid(config)

        self.assertTrue(any(row["rainfall1hMm"] == 10.0 for row in grid))
        self.assertTrue(any(row["riverRise3hM"] == 0.3 for row in grid))


if __name__ == "__main__":
    unittest.main()
