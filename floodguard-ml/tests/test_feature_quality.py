"""Tests for FloodGuard's ML feature-quality reporting helpers."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = PROJECT_ROOT / "src"
sys.path.insert(0, str(SRC_DIR))

from utils import build_feature_quality_report  # noqa: E402

import pandas as pd  # noqa: E402


class FeatureQualityTests(unittest.TestCase):
    def test_feature_quality_flags_missing_constant_and_rule_only_limits(self) -> None:
        frame = pd.DataFrame(
            [
                {
                    "areaId": "parramatta",
                    "areaName": "Parramatta, NSW",
                    "observedAt": "2026-07-01T00:00:00Z",
                    "targetElevatedConcern": 0,
                    "labelSource": "rule_derived",
                    "ruleConcernLevel": "Low",
                    "rainfallLatestMm": 1.0,
                    "rainfall1hMm": 2.0,
                    "rainfall3hMm": 3.0,
                    "rainfall24hMm": 4.0,
                    "rainfall72hMm": 5.0,
                    "antecedentWetnessMm": 6.0,
                    "antecedentRainfallIndex": 0.2,
                    "riverLatestM": 0.6,
                    "riverDelta1hM": None,
                    "riverDelta3hM": None,
                    "riverTrendCode": 0,
                    "rateOfRiseMPerHour": 0.0,
                    "dataFreshnessScore": 90,
                    "sourceCoverage": 0.9,
                    "warningActive": 0,
                    "areaRelevanceScore": 98,
                    "nearestStationDistanceKm": 0.5,
                    "trainingEligibility": 1,
                },
                {
                    "areaId": "toongabbie",
                    "areaName": "Toongabbie, NSW",
                    "observedAt": "2026-07-01T01:00:00Z",
                    "targetElevatedConcern": 1,
                    "labelSource": "rule_derived",
                    "ruleConcernLevel": "Moderate",
                    "rainfallLatestMm": 2.0,
                    "rainfall1hMm": 5.0,
                    "rainfall3hMm": 8.0,
                    "rainfall24hMm": 10.0,
                    "rainfall72hMm": 12.0,
                    "antecedentWetnessMm": 6.0,
                    "antecedentRainfallIndex": 0.4,
                    "riverLatestM": 0.7,
                    "riverDelta1hM": None,
                    "riverDelta3hM": None,
                    "riverTrendCode": 0,
                    "rateOfRiseMPerHour": 0.0,
                    "dataFreshnessScore": 91,
                    "sourceCoverage": 0.9,
                    "warningActive": 1,
                    "areaRelevanceScore": 98,
                    "nearestStationDistanceKm": 0.6,
                    "trainingEligibility": 1,
                },
            ]
        )
        frame["observedAt"] = pd.to_datetime(frame["observedAt"], utc=True)

        report = build_feature_quality_report(frame, "test")
        feature_rows = {row["feature"]: row for row in report["features"]}

        self.assertEqual(report["constantFeatureCount"], 5)
        self.assertEqual(feature_rows["riverDelta1hM"]["missingnessLevel"], "critical")
        self.assertEqual(feature_rows["rainfall1hMm"]["selectedForTraining"], True)
        self.assertTrue(
            any("independent event labels" in action for action in report["recommendedActions"])
        )


if __name__ == "__main__":
    unittest.main()
