"""Tests for FloodGuard's historical replay scaffolding."""

from __future__ import annotations

import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = PROJECT_ROOT / "src"
sys.path.insert(0, str(SRC_DIR))

from replay_events import build_replay_report, flatten_source_readings, run_replay, summarise_window  # noqa: E402

import pandas as pd  # noqa: E402


class ReplayEventsTests(unittest.TestCase):
    def test_flatten_source_readings_supports_legacy_history_rows(self) -> None:
        record = {
            "areaId": "parramatta",
            "ingestedAt": "2026-07-01T00:00:00Z",
            "freshness": {"status": "stale"},
            "rainfall": {
                "latestValidRainfallMm": 11.4,
                "latestPointTime": "2026-07-01T00:00:00Z",
                "sourceLabel": "legacy-rain",
            },
            "river": {
                "primaryHeightM": 0.91,
                "issuedDate": "2026-07-01T00:00:00Z",
                "primaryStationName": "Legacy river gauge",
            },
        }

        rows = flatten_source_readings(record)

        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["signalType"], "rainfall")
        self.assertEqual(rows[1]["signalType"], "river")
        self.assertEqual(rows[0]["freshnessStatus"], "stale")

    def test_summarise_window_reports_agreement_and_degraded_rows(self) -> None:
        area_rows = pd.DataFrame(
            [
                {
                    "areaId": "parramatta",
                    "observedAt": pd.Timestamp("2026-07-01T00:00:00Z"),
                    "ruleConcernLevel": "Low",
                    "targetRuleElevated": 0,
                    "warningStatus": "no_current_warning",
                    "sourceCoverage": 0.95,
                    "dataFreshnessScore": 95,
                },
                {
                    "areaId": "parramatta",
                    "observedAt": pd.Timestamp("2026-07-01T01:00:00Z"),
                    "ruleConcernLevel": "Moderate",
                    "targetRuleElevated": 1,
                    "warningStatus": "flood_watch",
                    "sourceCoverage": 0.55,
                    "dataFreshnessScore": 40,
                },
            ]
        )
        source_rows = pd.DataFrame(
            [
                {"source_type": "rainfall", "mode": "live", "freshness_status": "current"},
                {"source_type": "river", "mode": "cached_stale", "freshness_status": "stale"},
            ]
        )
        scored_predictions = {
            "parramatta|2026-07-01T00:00:00+00:00": {"predictedLabel": 0, "predictedProbability": 0.08},
            "parramatta|2026-07-01T01:00:00+00:00": {"predictedLabel": 1, "predictedProbability": 0.72},
        }

        summary = summarise_window(area_rows, source_rows, scored_predictions)

        self.assertEqual(summary["ruleConcern"], "Moderate")
        self.assertEqual(summary["degradedRows"], 1)
        self.assertEqual(summary["agreementRate"], 1.0)
        self.assertIn("flood_watch", summary["warningStates"])

    def test_summarise_window_keeps_low_scenario_clean_when_sources_and_ml_agree(self) -> None:
        area_rows = pd.DataFrame(
            [
                {
                    "areaId": "toongabbie",
                    "observedAt": pd.Timestamp("2026-07-02T00:00:00Z"),
                    "ruleConcernLevel": "Low",
                    "targetRuleElevated": 0,
                    "warningStatus": "no_current_warning",
                    "sourceCoverage": 0.96,
                    "dataFreshnessScore": 98,
                },
                {
                    "areaId": "toongabbie",
                    "observedAt": pd.Timestamp("2026-07-02T01:00:00Z"),
                    "ruleConcernLevel": "Low",
                    "targetRuleElevated": 0,
                    "warningStatus": "no_current_warning",
                    "sourceCoverage": 0.93,
                    "dataFreshnessScore": 94,
                },
            ]
        )
        source_rows = pd.DataFrame(
            [
                {"source_type": "rainfall", "mode": "live", "freshness_status": "current"},
                {"source_type": "river", "mode": "live", "freshness_status": "current"},
            ]
        )
        scored_predictions = {
            "toongabbie|2026-07-02T00:00:00+00:00": {
                "predictedLabel": 0,
                "predictedProbability": 0.04,
            },
            "toongabbie|2026-07-02T01:00:00+00:00": {
                "predictedLabel": 0,
                "predictedProbability": 0.06,
            },
        }

        summary = summarise_window(area_rows, source_rows, scored_predictions)

        self.assertEqual(summary["ruleConcern"], "Low")
        self.assertEqual(summary["degradedRows"], 0)
        self.assertEqual(summary["agreementRate"], 1.0)
        self.assertEqual(summary["warningStates"], ["no_current_warning"])
        self.assertEqual(summary["maxProbability"], 0.06)
        self.assertIn("rainfall:live", summary["sourceModes"])

    def test_summarise_window_flags_warning_active_high_window_and_ml_disagreement(self) -> None:
        area_rows = pd.DataFrame(
            [
                {
                    "areaId": "parramatta",
                    "observedAt": pd.Timestamp("2026-07-03T00:00:00Z"),
                    "ruleConcernLevel": "Moderate",
                    "targetRuleElevated": 1,
                    "warningStatus": "flood_watch",
                    "sourceCoverage": 0.82,
                    "dataFreshnessScore": 78,
                },
                {
                    "areaId": "parramatta",
                    "observedAt": pd.Timestamp("2026-07-03T01:00:00Z"),
                    "ruleConcernLevel": "High",
                    "targetRuleElevated": 1,
                    "warningStatus": "major_flood_warning",
                    "sourceCoverage": 0.58,
                    "dataFreshnessScore": 45,
                },
                {
                    "areaId": "parramatta",
                    "observedAt": pd.Timestamp("2026-07-03T02:00:00Z"),
                    "ruleConcernLevel": "High",
                    "targetRuleElevated": 1,
                    "warningStatus": "major_flood_warning",
                    "sourceCoverage": 0.51,
                    "dataFreshnessScore": 38,
                },
            ]
        )
        source_rows = pd.DataFrame(
            [
                {"source_type": "rainfall", "mode": "cached_stale", "freshness_status": "stale"},
                {"source_type": "river", "mode": "live", "freshness_status": "current"},
                {"source_type": "warnings", "mode": "remote", "freshness_status": "current"},
            ]
        )
        scored_predictions = {
            "parramatta|2026-07-03T00:00:00+00:00": {
                "predictedLabel": 1,
                "predictedProbability": 0.63,
            },
            "parramatta|2026-07-03T01:00:00+00:00": {
                "predictedLabel": 0,
                "predictedProbability": 0.41,
            },
            "parramatta|2026-07-03T02:00:00+00:00": {
                "predictedLabel": 1,
                "predictedProbability": 0.88,
            },
        }

        summary = summarise_window(area_rows, source_rows, scored_predictions)

        self.assertEqual(summary["ruleConcern"], "High")
        self.assertEqual(summary["degradedRows"], 2)
        self.assertEqual(summary["agreementRate"], 0.667)
        self.assertEqual(summary["maxProbability"], 0.88)
        self.assertEqual(summary["latestObservedAt"], "2026-07-03T02:00:00+00:00")
        self.assertIn("flood_watch", summary["warningStates"])
        self.assertIn("major_flood_warning", summary["warningStates"])
        self.assertIn("rainfall:cached_stale", summary["sourceModes"])

    def test_summarise_window_reports_unavailable_agreement_when_shadow_predictions_are_missing(self) -> None:
        area_rows = pd.DataFrame(
            [
                {
                    "areaId": "north-parramatta",
                    "observedAt": pd.Timestamp("2026-07-04T00:00:00Z"),
                    "ruleConcernLevel": "Moderate",
                    "targetRuleElevated": 1,
                    "warningStatus": "flood_watch",
                    "sourceCoverage": 0.88,
                    "dataFreshnessScore": 92,
                }
            ]
        )
        source_rows = pd.DataFrame(
            [
                {"source_type": "rainfall", "mode": "live", "freshness_status": "current"},
            ]
        )

        summary = summarise_window(area_rows, source_rows, {})

        self.assertEqual(summary["ruleConcern"], "Moderate")
        self.assertIsNone(summary["agreementRate"])
        self.assertIsNone(summary["maxProbability"])
        self.assertEqual(summary["degradedRows"], 0)
        self.assertEqual(summary["warningStates"], ["flood_watch"])

    def test_run_replay_writes_sqlite_tables_and_markdown_report(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            dataset_path = PROJECT_ROOT / "data" / "floodguard_training_dataset.csv"
            sqlite_path = temp_path / "history.sqlite"
            report_path = temp_path / "replay.md"

            original_dataset = dataset_path.read_text(encoding="utf-8")
            try:
                dataset_path.write_text(
                    "\n".join(
                        [
                            "areaId,areaName,observedAt,riskScore,ruleConcernLevel,targetElevatedConcern,labelSource,rainfallLatestMm,rainfall1hMm,rainfall3hMm,rainfall24hMm,rainfall72hMm,antecedentWetnessMm,antecedentRainfallIndex,riverLatestM,riverDelta1hM,riverDelta3hM,riverTrendCode,rateOfRiseMPerHour,dataFreshnessScore,sourceCoverage,decisionReliabilityScore,confidence,warningActive,warningStatus,areaRelevanceScore,nearestStationDistanceKm,areaJoinKey,targetRuleElevated,ruleLabelSource,targetEventElevated,eventLabelSource,eventLabelStrength,eventLabelNotes,eventLabelAvailable",
                            "parramatta,Parramatta NSW,2026-07-01T00:00:00Z,44,Moderate,1,rule_derived,5,12,20,25,40,30,0.4,0.9,0.12,0.2,1,0.12,88,0.9,86,0.82,1,flood_watch,97,0.7,parramatta,1,rule_derived,,, ,0",
                        ]
                    )
                    + "\n",
                    encoding="utf-8",
                )

                result = run_replay("parramatta", sqlite_path, report_path)

                self.assertEqual(result["datasetRowCount"], 1)
                self.assertTrue(sqlite_path.exists())
                self.assertTrue(report_path.exists())

                with sqlite3.connect(sqlite_path) as connection:
                    table_count = connection.execute(
                        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'risk_assessments'"
                    ).fetchone()[0]
                    risk_count = connection.execute(
                        "SELECT COUNT(*) FROM risk_assessments WHERE area_id = 'parramatta'"
                    ).fetchone()[0]
                self.assertEqual(table_count, 1)
                self.assertGreaterEqual(risk_count, 1)
                self.assertIn("FloodGuard Historical Replay", report_path.read_text(encoding="utf-8"))
            finally:
                dataset_path.write_text(original_dataset, encoding="utf-8")


if __name__ == "__main__":
    unittest.main()
