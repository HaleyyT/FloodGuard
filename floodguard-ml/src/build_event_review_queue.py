"""Build a lightweight evidence-review queue for event-label supervision."""

from __future__ import annotations

from pathlib import Path

from audit_labels import EVENT_BACKLOG_DATASET, load_event_backlog
from utils import (
    DATA_DIR,
    explicit_shadow_review_status,
    independent_event_source,
    placeholder_evidence_link,
    real_evidence_link_present,
)

import pandas as pd


REVIEW_QUEUE_PATH = DATA_DIR / "event_evidence_review_queue.csv"


REVIEW_QUEUE_COLUMNS = [
    "area",
    "event_name",
    "start_time",
    "end_time",
    "label",
    "label_source",
    "label_strength",
    "review_status",
    "evidence_link",
    "evidence_type",
    "source_status",
    "source_reference",
    "area_mapping_confidence",
    "evidence_is_placeholder",
    "required_evidence_missing",
    "promotion_blocked_reason",
    "review_priority",
    "recommended_next_action",
]


def queue_candidate_mask(backlog: pd.DataFrame) -> pd.Series:
    """Select only independently sourced non-demo event rows that still need evidence review."""

    if backlog.empty:
        return pd.Series(dtype="bool")

    independent_mask = independent_event_source(
        backlog.get("label_source", pd.Series(index=backlog.index, dtype="object"))
    )
    review_status = backlog.get("review_status", pd.Series(index=backlog.index, dtype="object"))
    review_mask = review_status.fillna("unknown").astype(str).isin(
        {"candidate_review", "reviewed_for_shadow_mode", "expert_validated"}
    )
    return independent_mask & review_mask


def recommended_next_action(row: pd.Series) -> str:
    """Give one explicit next step so a reviewer can replace placeholders with real evidence."""

    review_status = str(row.get("review_status", "unknown") or "unknown")
    evidence_link = str(row.get("evidence_link", "") or "")
    evidence_placeholder = bool(
        placeholder_evidence_link(pd.Series([evidence_link], dtype="object")).iloc[0]
    )
    has_real_evidence = bool(
        real_evidence_link_present(pd.Series([evidence_link], dtype="object")).iloc[0]
    )
    reviewer = str(row.get("reviewer", "") if pd.notna(row.get("reviewer", "")) else "").strip()
    reviewed_at = str(row.get("reviewed_at", "") if pd.notna(row.get("reviewed_at", "")) else "").strip()
    review_notes = str(
        row.get("review_notes", "") if pd.notna(row.get("review_notes", "")) else ""
    ).strip()

    if evidence_placeholder:
        return (
            "Replace placeholder link with a real warning archive, gauge record, council report, "
            "road closure notice, or verified local impact source."
        )
    if not has_real_evidence:
        return "Add a real evidence link before this label can be considered for review."
    if review_status == "candidate_review":
        return "Review the linked evidence and decide whether this can be upgraded to reviewed_for_shadow_mode."
    if review_status == "reviewed_for_shadow_mode":
        return "Keep in shadow-mode review; do not promote further without broader event coverage and holdout viability."
    if review_status == "expert_validated" and not (reviewer and reviewed_at and review_notes):
        return "Complete reviewer, reviewed_at, and review_notes before this row can count as expert_validated."
    return "No additional queue action required right now."


def build_event_review_queue(
    backlog_path: Path = EVENT_BACKLOG_DATASET,
    output_path: Path = REVIEW_QUEUE_PATH,
) -> pd.DataFrame:
    """Write the event evidence review queue as a CSV artifact for human review."""

    backlog = load_event_backlog(backlog_path)
    queue_rows = backlog.loc[queue_candidate_mask(backlog)].copy()

    if queue_rows.empty:
        empty = pd.DataFrame(columns=REVIEW_QUEUE_COLUMNS)
        output_path.write_text(empty.to_csv(index=False), encoding="utf-8")
        return empty

    evidence_placeholder = placeholder_evidence_link(queue_rows["evidence_link"])
    has_real_evidence = real_evidence_link_present(queue_rows["evidence_link"])
    explicit_review = explicit_shadow_review_status(queue_rows["review_status"])
    expert_validated = queue_rows["review_status"].fillna("unknown").astype(str).eq("expert_validated")
    expert_fields_complete = (
        queue_rows.get("reviewer", pd.Series(index=queue_rows.index, dtype="object"))
        .fillna("")
        .astype(str)
        .str.strip()
        .ne("")
        & queue_rows.get("reviewed_at", pd.Series(index=queue_rows.index, dtype="object"))
        .fillna("")
        .astype(str)
        .str.strip()
        .ne("")
        & queue_rows.get("review_notes", pd.Series(index=queue_rows.index, dtype="object"))
        .fillna("")
        .astype(str)
        .str.strip()
        .ne("")
    )
    required_evidence_missing = ~has_real_evidence
    required_evidence_missing = required_evidence_missing | (
        expert_validated & ~expert_fields_complete
    )
    required_evidence_missing = required_evidence_missing & ~(
        explicit_review & ~expert_validated & has_real_evidence
    )

    queue = pd.DataFrame(
        {
            "area": queue_rows["area"].astype(str),
            "event_name": queue_rows["event_name"].fillna("Unnamed event").astype(str),
            "start_time": queue_rows["start_time"].astype(str),
            "end_time": queue_rows["end_time"].astype(str),
            "label": pd.to_numeric(queue_rows["label_class"], errors="coerce").fillna(0).astype(int),
            "label_source": queue_rows["label_source"].astype(str),
            "label_strength": queue_rows["label_strength"].fillna("unknown").astype(str),
            "review_status": queue_rows["review_status"].fillna("unknown").astype(str),
            "evidence_link": queue_rows["evidence_link"].fillna("").astype(str),
            "evidence_type": queue_rows.get("evidence_type", pd.Series(index=queue_rows.index, dtype="object"))
            .fillna("unknown")
            .astype(str),
            "source_status": queue_rows.get("source_status", pd.Series(index=queue_rows.index, dtype="object"))
            .fillna("unknown")
            .astype(str),
            "source_reference": queue_rows.get(
                "source_reference", pd.Series(index=queue_rows.index, dtype="object")
            )
            .fillna("")
            .astype(str),
            "area_mapping_confidence": queue_rows.get(
                "area_mapping_confidence", pd.Series(index=queue_rows.index, dtype="object")
            )
            .fillna("unknown")
            .astype(str),
            "evidence_is_placeholder": evidence_placeholder.astype(bool),
            "required_evidence_missing": required_evidence_missing.astype(bool),
            "promotion_blocked_reason": queue_rows.get(
                "promotion_blocked_reason", pd.Series(index=queue_rows.index, dtype="object")
            )
            .fillna("")
            .astype(str),
            "review_priority": queue_rows["review_priority"].fillna("unknown").astype(str),
            "recommended_next_action": queue_rows.apply(recommended_next_action, axis=1),
        }
    )
    queue = queue.sort_values(
        by=["review_priority", "area", "start_time"], ascending=[True, True, True], kind="stable"
    )
    queue = queue[REVIEW_QUEUE_COLUMNS].reset_index(drop=True)
    output_path.write_text(queue.to_csv(index=False), encoding="utf-8")
    return queue


def main() -> None:
    queue = build_event_review_queue()
    print(f"Built event evidence review queue with {len(queue)} row(s).")


if __name__ == "__main__":
    main()
