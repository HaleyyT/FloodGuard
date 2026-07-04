"""Tests for FloodGuard's label-audit tooling."""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = PROJECT_ROOT / "src"
sys.path.insert(0, str(SRC_DIR))

from audit_labels import assess_supervision_quality, load_event_backlog, summarise_label_frame  # noqa: E402

import pandas as pd  # noqa: E402


class AuditLabelsTests(unittest.TestCase):
    def test_load_event_backlog_reads_label_classes_and_times(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            backlog_path = Path(temp_dir) / "event_label_backlog.csv"
            pd.DataFrame(
                [
                    {
                        "area": "parramatta",
                        "event_name": "Candidate event",
                        "start_time": "2026-06-29T00:00:00Z",
                        "end_time": "2026-06-29T12:00:00Z",
                        "label_class": 1,
                        "label_source": "warning_derived",
                        "label_strength": "moderate",
                        "review_status": "candidate_review",
                        "promotion_ready": "no",
                        "evidence_link": "",
                        "notes": "Test",
                    }
                ]
            ).to_csv(backlog_path, index=False)

            backlog = load_event_backlog(backlog_path)

        self.assertEqual(int(backlog.loc[0, "label_class"]), 1)
        self.assertEqual(backlog.loc[0, "label_source"], "warning_derived")
        self.assertEqual(backlog.loc[0, "review_status"], "candidate_review")
        self.assertTrue(pd.notna(backlog.loc[0, "start_time"]))

    def test_summarise_label_frame_counts_positive_backlog_rows(self) -> None:
        frame = pd.DataFrame(
            [
                {
                    "area": "parramatta",
                    "event_name": "Non-event",
                    "start_time": "2026-06-24T00:00:00Z",
                    "end_time": "2026-07-02T00:00:00Z",
                    "label_class": 0,
                    "label_source": "manual_demo",
                    "label_strength": "weak",
                    "review_status": "scaffold_only",
                },
                {
                    "area": "toongabbie",
                    "event_name": "Candidate event",
                    "start_time": "2026-06-30T00:00:00Z",
                    "end_time": "2026-06-30T06:00:00Z",
                    "label_class": 2,
                    "label_source": "impact_candidate",
                    "label_strength": "weak",
                    "review_status": "candidate_review",
                },
            ]
        )

        summary = summarise_label_frame(frame, "event_label_backlog.csv")

        self.assertEqual(summary["rowCount"], 2)
        self.assertEqual(summary["positiveRows"], 1)
        self.assertIn("parramatta", summary["areas"])
        self.assertEqual(summary["labelSourceCounts"]["manual_demo"], 1)
        self.assertEqual(summary["reviewStatusCounts"]["scaffold_only"], 1)

    def test_assess_supervision_quality_stays_weak_for_scaffold_only_labels(self) -> None:
        labels_summary = {
            "positiveRows": 0,
            "labelStrengthCounts": {"weak": 3},
            "reviewStatusCounts": {"scaffold_only": 3},
        }
        backlog_summary = {"rowCount": 5, "positiveRows": 2}

        quality = assess_supervision_quality(labels_summary, backlog_summary)

        self.assertEqual(quality["grade"], "weak")
        self.assertFalse(quality["viableForIndependentSupervision"])
        self.assertIn("scaffold-level", quality["summary"])


if __name__ == "__main__":
    unittest.main()
