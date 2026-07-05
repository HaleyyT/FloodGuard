"""Tests for the event-evidence review queue workflow."""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = PROJECT_ROOT / "src"
sys.path.insert(0, str(SRC_DIR))

from build_event_review_queue import build_event_review_queue  # noqa: E402
from utils import placeholder_evidence_link, real_evidence_link_present  # noqa: E402

import pandas as pd  # noqa: E402


class BuildEventReviewQueueTests(unittest.TestCase):
    def test_placeholder_detection_separates_example_test_from_real_links(self) -> None:
        links = pd.Series(
            [
                "https://example.test/floodguard/event",
                "https://www.ses.nsw.gov.au/warnings/example",
                "",
            ],
            dtype="object",
        )

        self.assertEqual(placeholder_evidence_link(links).tolist(), [True, False, False])
        self.assertEqual(real_evidence_link_present(links).tolist(), [False, True, False])

    def test_build_event_review_queue_marks_placeholder_rows_as_missing_evidence(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            backlog_path = temp_path / "event_label_backlog.csv"
            output_path = temp_path / "event_evidence_review_queue.csv"

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
                        "join_status": "joined_to_labels",
                        "evidence_link": "https://example.test/floodguard/labels/parramatta-warning-window",
                        "notes": "Placeholder evidence only.",
                    },
                    {
                        "area": "north-parramatta",
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
                        "notes": "Demo-only row.",
                    },
                    {
                        "area": "toongabbie",
                        "event_name": "Candidate impact window with real notice",
                        "start_time": "2026-06-30T00:00:00Z",
                        "end_time": "2026-06-30T06:00:00Z",
                        "label_class": 1,
                        "label_source": "impact_derived",
                        "label_strength": "strong",
                        "review_status": "candidate_review",
                        "promotion_ready": "no",
                        "independence_level": "moderate",
                        "review_priority": "high",
                        "join_status": "backlog_only",
                        "evidence_link": "https://council.example.gov.au/flood-report",
                        "notes": "Real evidence candidate.",
                    },
                ]
            ).to_csv(backlog_path, index=False)

            queue = build_event_review_queue(backlog_path=backlog_path, output_path=output_path)

            written = pd.read_csv(output_path)

        self.assertEqual(len(queue), 2)
        self.assertEqual(len(written), 2)
        self.assertEqual(written["area"].tolist(), ["parramatta", "toongabbie"])
        self.assertEqual(written.loc[0, "evidence_is_placeholder"], True)
        self.assertEqual(written.loc[0, "required_evidence_missing"], True)
        self.assertIn("Replace placeholder link", written.loc[0, "recommended_next_action"])
        self.assertEqual(written.loc[1, "evidence_is_placeholder"], False)
        self.assertEqual(written.loc[1, "required_evidence_missing"], False)
        self.assertIn("Review the linked evidence", written.loc[1, "recommended_next_action"])


if __name__ == "__main__":
    unittest.main()
