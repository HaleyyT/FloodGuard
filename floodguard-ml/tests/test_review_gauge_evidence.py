"""Tests for attaching real gauge evidence packs to backlog candidates."""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = PROJECT_ROOT / "src"
sys.path.insert(0, str(SRC_DIR))

from review_gauge_evidence import canonical_events_url, evidence_summary, review_gauge_candidates  # noqa: E402

import pandas as pd  # noqa: E402


class ReviewGaugeEvidenceTests(unittest.TestCase):
    def test_canonical_events_url_converts_timeseries_url_into_review_query(self) -> None:
        start = pd.Timestamp("2026-06-12T00:00:00Z")
        end = pd.Timestamp("2026-06-12T06:00:00Z")

        url = canonical_events_url(
            "https://parramatta.lizard.net/api/v4/timeseries/abc123/?format=json",
            start,
            end,
        )

        self.assertIn("/timeseries/abc123/events/", url)
        self.assertIn("time__gte=2026-06-12T00%3A00%3A00Z", url)
        self.assertIn("time__lte=2026-06-12T06%3A00%3A00Z", url)

    def test_evidence_summary_counts_non_zero_rows(self) -> None:
        summary = evidence_summary(
            {
                "results": [
                    {"time": "2026-06-12T00:00:00Z", "value": 0},
                    {"time": "2026-06-12T00:05:00Z", "value": 2.5},
                    {"time": "2026-06-12T00:10:00Z", "value": 1.0},
                ]
            }
        )

        self.assertEqual(summary["rowCount"], 3)
        self.assertEqual(summary["nonZeroCount"], 2)
        self.assertEqual(summary["maxValue"], 2.5)
        self.assertEqual(summary["totalValue"], 3.5)

    def test_review_gauge_candidates_attaches_real_links_but_keeps_mismatches_unreviewed(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            backlog_path = temp_path / "event_label_backlog.csv"
            labels_path = temp_path / "labels.csv"
            latest_signals_path = temp_path / "latest-signals.json"
            evidence_dir = temp_path / "review_evidence"
            report_path = temp_path / "gauge_evidence_review.md"

            pd.DataFrame(
                [
                    {
                        "area": "parramatta",
                        "event_name": "Parramatta gauge-threshold candidate window",
                        "start_time": "2026-06-12T05:24:44.242000+00:00",
                        "end_time": "2026-06-12T05:24:44.242000+00:00",
                        "label_class": 1,
                        "label_source": "gauge_threshold",
                        "label_strength": "weak",
                        "review_status": "candidate_review",
                        "promotion_ready": "no",
                        "join_status": "backlog_only",
                        "evidence_link": "",
                        "source_reference": "history:parramatta",
                        "area_mapping_confidence": "high",
                    }
                ]
            ).to_csv(backlog_path, index=False)
            pd.DataFrame(
                [
                    {
                        "area": "parramatta",
                        "start_time": "2026-06-01T00:00:00Z",
                        "end_time": "2026-06-02T00:00:00Z",
                        "label": 0,
                        "label_source": "manual_demo",
                        "label_strength": "weak",
                        "review_status": "scaffold_only",
                        "evidence_link": "",
                    }
                ]
            ).to_csv(labels_path, index=False)
            latest_signals_path.write_text(
                json.dumps(
                    {
                        "areas": {
                            "parramatta": {
                                "rainfallSeries": {
                                    "stationName": "Burnside Homes",
                                    "timeseriesName": "https://parramatta.lizard.net/api/v4/timeseries/abc123/?format=json",
                                }
                            }
                        }
                    }
                ),
                encoding="utf-8",
            )

            with patch("review_gauge_evidence.LATEST_SIGNALS_PATH", latest_signals_path), patch(
                "review_gauge_evidence.EVIDENCE_DIR", evidence_dir
            ), patch("review_gauge_evidence.REPORT_PATH", report_path), patch(
                "review_gauge_evidence.fetch_json",
                return_value={"results": [{"time": "2026-06-12T05:20:00Z", "value": 0.0}]},
            ), patch(
                "review_gauge_evidence.build_event_review_queue"
            ), patch(
                "review_gauge_evidence.write_label_audit_artifacts"
            ), patch(
                "review_gauge_evidence.promote_reviewed_labels",
                return_value={
                    "promotedCount": 0,
                    "reviewedEventWindows": 0,
                    "reviewedElevatedEventWindows": 0,
                },
            ):
                review_gauge_candidates(backlog_path=backlog_path, labels_path=labels_path, max_rows=1)

            updated = pd.read_csv(backlog_path)
            self.assertIn("/timeseries/abc123/events/", updated.loc[0, "evidence_link"])
            self.assertEqual(updated.loc[0, "evidence_support_status"], "mismatch")
            self.assertEqual(updated.loc[0, "review_status"], "candidate_review")
            self.assertEqual(updated.loc[0, "promotion_ready"], "no")
            self.assertTrue(str(updated.loc[0, "reviewed_at"]).strip())
            self.assertTrue(evidence_dir.exists())
            self.assertIn("Evidence-mismatch windows: 1", report_path.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
