"""Tests for automated candidate-event backlog generation."""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = PROJECT_ROOT / "src"
sys.path.insert(0, str(SRC_DIR))

from build_candidate_event_backlog import build_candidate_event_backlog, gauge_triggered  # noqa: E402

import pandas as pd  # noqa: E402


def write_jsonl(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(f"{json.dumps(row)}\n" for row in rows), encoding="utf-8")


class BuildCandidateEventBacklogTests(unittest.TestCase):
    def test_gauge_triggered_rejects_uncorroborated_max_recent_rainfall(self) -> None:
        record = {
            "riskScore": 33,
            "riskFeatures": {
                "latestRainfallMm": 0,
                "maxRecentRainfallMm": 10.5,
                "rainfall24hMm": 0,
                "rainfall72hMm": 0,
                "risingRiverStations": 0,
            },
        }

        self.assertFalse(gauge_triggered(record))

    def test_build_candidate_backlog_groups_contiguous_gauge_windows_without_duplicates(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            backlog_path = temp_path / "event_label_backlog.csv"
            history_dir = temp_path / "history"
            parsed_dir = temp_path / "parsed"
            queue_path = temp_path / "event_evidence_review_queue.csv"

            pd.DataFrame(
                [
                    {
                        "area": "parramatta",
                        "event_name": "Baseline non-event demo window",
                        "start_time": "2026-06-24T00:00:00Z",
                        "end_time": "2026-07-02T00:00:00Z",
                        "label_class": 0,
                        "label_source": "manual_demo",
                        "label_strength": "weak",
                        "review_status": "scaffold_only",
                        "promotion_ready": "no",
                        "independence_level": "low",
                        "review_priority": "low",
                        "join_status": "joined_to_labels",
                        "evidence_link": "",
                        "notes": "demo",
                    }
                ]
            ).to_csv(backlog_path, index=False)

            write_jsonl(
                history_dir / "parramatta.jsonl",
                [
                    {
                        "areaId": "parramatta",
                        "ingestedAt": "2026-07-01T00:00:00Z",
                        "riskScore": 46,
                        "riskFeatures": {
                            "latestRainfallMm": 12,
                            "maxRecentRainfallMm": 12,
                            "rainfall24hMm": 35,
                            "rainfall72hMm": 40,
                            "risingRiverStations": 0,
                        },
                        "freshness": {"status": "ok"},
                    },
                    {
                        "areaId": "parramatta",
                        "ingestedAt": "2026-07-01T03:00:00Z",
                        "riskScore": 48,
                        "riskFeatures": {
                            "latestRainfallMm": 9,
                            "maxRecentRainfallMm": 11,
                            "rainfall24hMm": 32,
                            "rainfall72hMm": 45,
                            "risingRiverStations": 1,
                        },
                        "freshness": {"status": "ok"},
                    },
                ],
            )

            first = build_candidate_event_backlog(
                backlog_path=backlog_path,
                history_dir=history_dir,
                parsed_dir=parsed_dir,
                queue_path=queue_path,
            )
            second = build_candidate_event_backlog(
                backlog_path=backlog_path,
                history_dir=history_dir,
                parsed_dir=parsed_dir,
                queue_path=queue_path,
            )

            self.assertEqual(len(first), 2)
            self.assertEqual(len(second), 2)
            candidate_row = first[first["label_source"] == "gauge_threshold"].iloc[0]
            self.assertEqual(candidate_row["review_status"], "candidate_review")
            self.assertEqual(candidate_row["promotion_ready"], "no")
            self.assertIn("reviewed gauge archive", candidate_row["promotion_blocked_reason"])

    def test_build_candidate_backlog_adds_warning_and_transport_candidates_with_area_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            backlog_path = temp_path / "event_label_backlog.csv"
            history_dir = temp_path / "history"
            parsed_dir = temp_path / "parsed"
            queue_path = temp_path / "event_evidence_review_queue.csv"
            pd.DataFrame(columns=["area"]).to_csv(backlog_path, index=False)

            write_jsonl(
                parsed_dir / "hazardwatch_warning_context.jsonl",
                [
                    {
                        "sourceKey": "hazardwatch_warning_context",
                        "status": "ok",
                        "sourceUrl": "https://hazardwatch.gov.au/",
                        "fetchedAt": "2026-07-02T00:00:00Z",
                        "observedAt": "2026-07-02T00:00:00Z",
                        "evidenceType": "warning_context",
                        "items": [
                            {
                                "title": "Parramatta flood warning",
                                "link": "https://hazardwatch.gov.au/warnings/parramatta",
                                "observedAt": "2026-07-02T00:00:00Z",
                                "description": "Parramatta flood warning",
                                "matchedAreas": ["parramatta"],
                            }
                        ],
                    },
                    {
                        "sourceKey": "transport_nsw_live_traffic",
                        "status": "ok",
                        "sourceUrl": "https://transport.example/incidents",
                        "fetchedAt": "2026-07-02T01:00:00Z",
                        "observedAt": "2026-07-02T01:00:00Z",
                        "evidenceType": "impact_context",
                        "items": [
                            {
                                "title": "Toongabbie road closed due to flooding",
                                "link": "https://transport.example/incidents/1",
                                "observedAt": "2026-07-02T01:00:00Z",
                                "description": "Toongabbie road closed due to flooding",
                                "matchedAreas": ["toongabbie"],
                            }
                        ],
                    },
                ],
            )

            backlog = build_candidate_event_backlog(
                backlog_path=backlog_path,
                history_dir=history_dir,
                parsed_dir=parsed_dir,
                queue_path=queue_path,
            )

            self.assertEqual(len(backlog), 2)
            self.assertEqual(set(backlog["label_source"].tolist()), {"warning_derived", "impact_derived"})
            impact_row = backlog[backlog["label_source"] == "impact_derived"].iloc[0]
            self.assertEqual(impact_row["label_strength"], "strong")
            self.assertEqual(impact_row["area_mapping_confidence"], "high")


if __name__ == "__main__":
    unittest.main()
