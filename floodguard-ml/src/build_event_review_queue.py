"""Build a lightweight evidence-review queue for event-label supervision."""

from __future__ import annotations

from pathlib import Path

from audit_labels import EVENT_BACKLOG_DATASET, load_event_backlog
from utils import (
    DATA_DIR,
    REPORTS_DIR,
    explicit_shadow_review_status,
    independent_event_source,
    placeholder_evidence_link,
    real_evidence_link_present,
)

import pandas as pd


REVIEW_QUEUE_PATH = DATA_DIR / "event_evidence_review_queue.csv"
REVIEW_QUEUE_REPORT_PATH = REPORTS_DIR / "event_evidence_review_queue.md"


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
    "evidence_is_real",
    "evidence_is_placeholder",
    "area_match_status",
    "time_window_status",
    "supervision_kind",
    "required_evidence_missing",
    "can_become_reviewed_for_shadow_mode",
    "promotion_blocked_reason",
    "review_priority",
    "recommended_next_action",
]


def clean_str(value: object, default: str = "") -> str:
    """Normalise optional CSV values so pandas NA does not leak into boolean checks."""

    if pd.isna(value):
        return default
    return str(value).strip()


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

    review_status = clean_str(row.get("review_status", "unknown"), "unknown") or "unknown"
    evidence_link = clean_str(row.get("evidence_link", ""))
    evidence_placeholder = bool(
        placeholder_evidence_link(pd.Series([evidence_link], dtype="object")).iloc[0]
    )
    has_real_evidence = bool(
        real_evidence_link_present(pd.Series([evidence_link], dtype="object")).iloc[0]
    )
    reviewer = clean_str(row.get("reviewer", ""))
    reviewed_at = clean_str(row.get("reviewed_at", ""))
    review_notes = clean_str(row.get("review_notes", ""))

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


def supervision_kind(label_source: str) -> str:
    """Translate internal label sources into reviewer-facing supervision categories."""

    normalised = (label_source or "unknown").strip().lower()
    if normalised == "warning_derived":
        return "warning-derived"
    if normalised == "gauge_threshold":
        return "gauge-threshold"
    if normalised in {"impact_candidate", "impact_derived"}:
        return "impact-derived"
    return "other"


def area_match_status(row: pd.Series) -> str:
    """Summarise whether the area linkage looks direct enough for review."""

    confidence = clean_str(row.get("area_mapping_confidence", "unknown"), "unknown").lower()
    matched_reason = clean_str(row.get("matched_area_reason", "")).lower()
    source_reference = clean_str(row.get("source_reference", "")).lower()
    area = clean_str(row.get("area", "")).lower()

    if source_reference == f"history:{area}" and confidence == "high":
        return "direct_history_match"
    if confidence == "high" and matched_reason:
        return "high_confidence_area_match"
    if confidence in {"moderate", "medium"}:
        return "review_area_mapping"
    if not matched_reason and not source_reference:
        return "area_mapping_missing"
    return "needs_area_review"


def time_window_status(row: pd.Series) -> str:
    """Summarise whether the event window is explicit enough for later evidence checks."""

    start_time = pd.to_datetime(row.get("start_time"), errors="coerce", utc=True)
    end_time = pd.to_datetime(row.get("end_time"), errors="coerce", utc=True)
    if pd.isna(start_time) or pd.isna(end_time):
        return "missing_window"
    if end_time < start_time:
        return "invalid_window"
    if start_time == end_time:
        return "instant_window_review"
    return "window_present"


def can_become_reviewed_for_shadow_mode(row: pd.Series) -> bool:
    """Require real evidence and a non-demo independent source before review upgrade."""

    label_source = clean_str(row.get("label_source", "unknown"), "unknown")
    review_status = clean_str(row.get("review_status", "unknown"), "unknown")
    evidence_link = pd.Series([row.get("evidence_link", "")], dtype="object")
    has_real_evidence = bool(real_evidence_link_present(evidence_link).iloc[0])
    independent_source = bool(independent_event_source(pd.Series([label_source], dtype="object")).iloc[0])
    explicit_review = bool(
        explicit_shadow_review_status(pd.Series([review_status], dtype="object")).iloc[0]
    )
    valid_window = time_window_status(row) in {"window_present", "instant_window_review"}
    area_match = area_match_status(row) in {"direct_history_match", "high_confidence_area_match"}
    return independent_source and valid_window and area_match and (has_real_evidence or explicit_review)


def write_review_queue_report(queue: pd.DataFrame, output_path: Path = REVIEW_QUEUE_REPORT_PATH) -> None:
    """Write a reviewer-facing markdown summary for the strongest current candidate windows."""

    if queue.empty:
        output_path.write_text(
            "# FloodGuard Event Evidence Review Queue\n\nNo candidate review rows are available right now.\n",
            encoding="utf-8",
        )
        return

    review_ready = int(queue["can_become_reviewed_for_shadow_mode"].fillna(False).astype(bool).sum())
    real_evidence = int(queue["evidence_is_real"].fillna(False).astype(bool).sum())
    placeholder_rows = int(queue["evidence_is_placeholder"].fillna(False).astype(bool).sum())
    high_priority = queue[queue["review_priority"].fillna("unknown").astype(str).eq("high")].copy()
    top_candidates = high_priority.head(5)
    if len(top_candidates) < 5:
        remaining = queue.loc[~queue.index.isin(top_candidates.index)].head(5 - len(top_candidates))
        top_candidates = pd.concat([top_candidates, remaining], ignore_index=False)

    lines = [
        "# FloodGuard Event Evidence Review Queue",
        "",
        "This report highlights the current best candidate event windows for human evidence review.",
        "",
        "## Queue Summary",
        "",
        f"- Candidate windows in queue: {len(queue)}",
        f"- High-priority candidate windows: {len(high_priority)}",
        f"- Windows with real evidence links: {real_evidence}",
        f"- Windows still using placeholder evidence: {placeholder_rows}",
        f"- Windows currently eligible to become `reviewed_for_shadow_mode`: {review_ready}",
        "",
        "## Top Candidate Windows",
        "",
    ]

    for _, row in top_candidates.iterrows():
        lines.extend(
            [
                f"### {row['event_name']}",
                "",
                f"- Area: `{row['area']}`",
                f"- Window: `{row['start_time']}` to `{row['end_time']}`",
                f"- Supervision kind: `{row['supervision_kind']}`",
                f"- Label strength: `{row['label_strength']}`",
                f"- Review status: `{row['review_status']}`",
                f"- Evidence link real: `{bool(row['evidence_is_real'])}`",
                f"- Evidence link placeholder: `{bool(row['evidence_is_placeholder'])}`",
                f"- Area match status: `{row['area_match_status']}`",
                f"- Time window status: `{row['time_window_status']}`",
                f"- Can become `reviewed_for_shadow_mode`: `{bool(row['can_become_reviewed_for_shadow_mode'])}`",
                f"- Recommended next action: {row['recommended_next_action']}",
                "",
            ]
        )

    lines.extend(
        [
            "## Interpretation",
            "",
            "- This queue is a review aid, not automatic ML validation.",
            "- Placeholder links and missing evidence still block promotion.",
            "- FloodGuard ML remains shadow mode until reviewed elevated windows become real and defensible.",
            "",
        ]
    )
    output_path.write_text("\n".join(lines), encoding="utf-8")


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
            "evidence_is_real": has_real_evidence.astype(bool),
            "evidence_is_placeholder": evidence_placeholder.astype(bool),
            "area_match_status": queue_rows.apply(area_match_status, axis=1),
            "time_window_status": queue_rows.apply(time_window_status, axis=1),
            "supervision_kind": queue_rows["label_source"].fillna("unknown").astype(str).map(supervision_kind),
            "required_evidence_missing": required_evidence_missing.astype(bool),
            "can_become_reviewed_for_shadow_mode": queue_rows.apply(
                can_become_reviewed_for_shadow_mode, axis=1
            ),
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
    write_review_queue_report(queue)
    return queue


def main() -> None:
    queue = build_event_review_queue()
    print(f"Built event evidence review queue with {len(queue)} row(s).")


if __name__ == "__main__":
    main()
