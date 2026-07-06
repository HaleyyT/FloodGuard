"""Audit FloodGuard label files and produce a report for ML credibility review."""

from __future__ import annotations

from pathlib import Path

from build_dataset import load_label_windows
from utils import (
    DATA_DIR,
    REPORTS_DIR,
    ensure_runtime_dirs,
    evidence_link_present,
    explicit_shadow_review_status,
    expert_review_fields_complete,
    independent_event_source,
    placeholder_evidence_link,
    real_evidence_link_present,
    reviewed_event_status,
    strong_event_strength,
    write_json,
)

import pandas as pd


EVENT_BACKLOG_DATASET = DATA_DIR / "event_label_backlog.csv"
LABEL_AUDIT_REPORT = REPORTS_DIR / "label_audit.md"
LEGACY_LABEL_AUDIT_REPORT = REPORTS_DIR / "label_audit_report.md"
LABEL_AUDIT_JSON = REPORTS_DIR / "label_audit.json"


def load_event_backlog(backlog_path: Path = EVENT_BACKLOG_DATASET) -> pd.DataFrame:
    """Load the event-label backlog or return an empty frame with the expected schema."""

    columns = [
        "area",
        "event_name",
        "start_time",
        "end_time",
        "label_class",
        "label_source",
        "label_strength",
        "review_status",
        "promotion_ready",
        "independence_level",
        "review_priority",
        "join_status",
        "evidence_link",
        "evidence_type",
        "source_status",
        "source_reference",
        "area_mapping_confidence",
        "matched_area_reason",
        "promotion_blocked_reason",
        "evidence_support_status",
        "review_notes",
        "reviewer",
        "reviewed_at",
        "notes",
    ]
    if not backlog_path.exists():
        return pd.DataFrame(columns=columns)

    backlog = pd.read_csv(backlog_path)
    if backlog.empty:
        return pd.DataFrame(columns=columns)

    for column in columns:
        if column not in backlog.columns:
            backlog[column] = pd.NA

    backlog["start_time"] = pd.to_datetime(
        backlog["start_time"], errors="coerce", utc=True, format="mixed"
    )
    backlog["end_time"] = pd.to_datetime(
        backlog["end_time"], errors="coerce", utc=True, format="mixed"
    )
    backlog["label_class"] = pd.to_numeric(backlog["label_class"], errors="coerce")
    return backlog


def summarise_label_frame(frame: pd.DataFrame, name: str) -> dict:
    """Create a compact audit summary for one label source."""

    if frame.empty:
        return {
            "name": name,
            "rowCount": 0,
            "timeSpan": {"start": None, "end": None},
            "areas": [],
            "labelSourceCounts": {},
            "labelStrengthCounts": {},
            "reviewStatusCounts": {},
            "promotionReadyCounts": {},
            "positiveRows": 0,
        }

    label_column = "label" if "label" in frame.columns else "label_class"
    positives = int((pd.to_numeric(frame[label_column], errors="coerce").fillna(0) > 0).sum())
    starts = pd.to_datetime(frame["start_time"], errors="coerce", utc=True).dropna()
    ends = pd.to_datetime(frame["end_time"], errors="coerce", utc=True).dropna()
    review_status_series = frame.get("review_status", pd.Series(dtype="object"))
    promotion_ready_series = frame.get("promotion_ready", pd.Series(dtype="object"))
    evidence_link_series = frame.get("evidence_link", pd.Series(dtype="object"))
    label_strength_series = frame.get("label_strength", pd.Series(dtype="object"))
    label_source_series = frame["label_source"].fillna("unknown").astype(str)
    positive_mask = pd.to_numeric(frame[label_column], errors="coerce").fillna(0) > 0
    review_status_counts = review_status_series.fillna("unknown").value_counts(dropna=False).to_dict()
    promotion_ready_counts = promotion_ready_series.fillna("unknown").value_counts(dropna=False).to_dict()
    evidence_mask = evidence_link_present(evidence_link_series)
    placeholder_evidence_mask = placeholder_evidence_link(evidence_link_series)
    real_evidence_mask = real_evidence_link_present(evidence_link_series)
    explicit_review_mask = explicit_shadow_review_status(review_status_series)
    expert_metadata_mask = expert_review_fields_complete(
        frame.get("reviewer", pd.Series(dtype="object")),
        frame.get("reviewed_at", pd.Series(dtype="object")),
        frame.get("review_notes", pd.Series(dtype="object")),
    )
    reviewed_mask = reviewed_event_status(review_status_series) & (
        ~review_status_series.fillna("unknown").astype(str).eq("expert_validated")
        | expert_metadata_mask
    )
    independent_mask = independent_event_source(label_source_series)
    strong_mask = strong_event_strength(label_strength_series)
    reviewable_mask = independent_mask & (real_evidence_mask | reviewed_mask)
    reviewable_positive_mask = reviewable_mask & positive_mask
    evidence_linked_rows = int(evidence_mask.sum())
    placeholder_evidence_rows = int(placeholder_evidence_mask.sum())
    placeholder_evidence_positive_rows = int((placeholder_evidence_mask & positive_mask).sum())
    real_evidence_rows = int(real_evidence_mask.sum())
    real_evidence_positive_rows = int((real_evidence_mask & positive_mask).sum())
    promotable_rows = int(
        (
            promotion_ready_series
            .fillna("no")
            .astype(str)
            .str.lower()
            .isin({"yes", "ready", "promotable"})
            & reviewable_mask
        ).sum()
    )
    reviewed_rows = int((reviewed_mask & reviewable_mask).sum())
    reviewed_positive_rows = int((reviewed_mask & positive_mask).sum())
    evidence_linked_positive_rows = int((evidence_mask & positive_mask).sum())
    explicit_review_rows = int((explicit_review_mask & independent_mask).sum())
    independent_positive_rows = int(reviewable_positive_mask.sum())
    reviewable_positive_rows = int(reviewable_positive_mask.sum())
    strong_reviewable_positive_rows = int((reviewable_positive_mask & strong_mask).sum())

    return {
        "name": name,
        "rowCount": int(len(frame)),
        "timeSpan": {
            "start": None if starts.empty else starts.min().isoformat(),
            "end": None if ends.empty else ends.max().isoformat(),
        },
        "areas": sorted(frame["area"].dropna().astype(str).unique().tolist()),
        "labelSourceCounts": label_source_series.value_counts(dropna=False).to_dict(),
        "labelStrengthCounts": frame["label_strength"].fillna("unknown").value_counts(dropna=False).to_dict(),
        "labelClassCounts": frame.get("label_class", pd.Series(dtype="float64")).fillna("unknown").value_counts(dropna=False).to_dict(),
        "reviewStatusCounts": review_status_counts,
        "promotionReadyCounts": promotion_ready_counts,
        "independenceLevelCounts": frame.get("independence_level", pd.Series(dtype="object"))
        .fillna("unknown")
        .value_counts(dropna=False)
        .to_dict(),
        "reviewPriorityCounts": frame.get("review_priority", pd.Series(dtype="object"))
        .fillna("unknown")
        .value_counts(dropna=False)
        .to_dict(),
        "joinStatusCounts": frame.get("join_status", pd.Series(dtype="object"))
        .fillna("unknown")
        .value_counts(dropna=False)
        .to_dict(),
        "evidenceTypeCounts": frame.get("evidence_type", pd.Series(dtype="object"))
        .fillna("unknown")
        .value_counts(dropna=False)
        .to_dict(),
        "evidenceSupportStatusCounts": frame.get(
            "evidence_support_status", pd.Series(dtype="object")
        )
        .fillna("unknown")
        .value_counts(dropna=False)
        .to_dict(),
        "sourceStatusCounts": frame.get("source_status", pd.Series(dtype="object"))
        .fillna("unknown")
        .value_counts(dropna=False)
        .to_dict(),
        "areaMappingConfidenceCounts": frame.get(
            "area_mapping_confidence", pd.Series(dtype="object")
        )
        .fillna("unknown")
        .value_counts(dropna=False)
        .to_dict(),
        "positiveRows": positives,
        "independentPositiveRows": independent_positive_rows,
        "evidenceLinkedRows": evidence_linked_rows,
        "evidenceLinkedPositiveRows": evidence_linked_positive_rows,
        "placeholderEvidenceRows": placeholder_evidence_rows,
        "placeholderEvidencePositiveRows": placeholder_evidence_positive_rows,
        "realEvidenceRows": real_evidence_rows,
        "realEvidencePositiveRows": real_evidence_positive_rows,
        "explicitReviewRows": explicit_review_rows,
        "reviewedRows": reviewed_rows,
        "reviewedPositiveRows": reviewed_positive_rows,
        "promotableRows": promotable_rows,
        "reviewableRows": int(reviewable_mask.sum()),
        "reviewablePositiveRows": reviewable_positive_rows,
        "strongReviewablePositiveRows": strong_reviewable_positive_rows,
    }


def assess_supervision_quality(labels_summary: dict, backlog_summary: dict) -> dict:
    """Summarise whether FloodGuard has credible independent supervision yet."""

    positive_rows = int(labels_summary.get("positiveRows", 0))
    strong_or_moderate = int(labels_summary.get("strongReviewablePositiveRows", 0))
    reviewed_rows = int(labels_summary.get("reviewedRows", 0))
    reviewable_rows = int(labels_summary.get("reviewableRows", 0))
    reviewable_positive_rows = int(labels_summary.get("reviewablePositiveRows", 0))
    backlog_independent_positives = int(backlog_summary.get("independentPositiveRows", 0))
    backlog_evidence_linked = int(backlog_summary.get("evidenceLinkedRows", 0))
    backlog_placeholder_rows = int(backlog_summary.get("placeholderEvidenceRows", 0))
    backlog_promotable = int(backlog_summary.get("promotableRows", 0))

    if positive_rows > 0 and strong_or_moderate > 0 and reviewed_rows > 0 and reviewable_positive_rows > 0:
        grade = "reviewable"
        summary = "Independent labels are strong enough for shadow-mode event supervision review."
        viable = True
        primary_limitation = "Independent supervision is present, but advisory-mode evidence is still incomplete."
    elif reviewable_positive_rows > 0 or strong_or_moderate > 0 or reviewed_rows > 0:
        grade = "developing"
        summary = "Independent label scaffolding exists, but coverage or review quality is still too weak for validated ML claims."
        viable = False
        primary_limitation = "Joined labels still lack enough reviewed elevated windows to support validated ML claims."
    elif backlog_independent_positives > 0 or backlog_evidence_linked > 0:
        grade = "developing"
        summary = "Candidate event windows exist, but the current evidence is still placeholder-level or not reviewed enough for validated ML claims."
        viable = False
        primary_limitation = (
            "Candidate event windows still rely on placeholder or unreviewed evidence, so joined labels are not yet defensible independent supervision."
        )
    else:
        grade = "weak"
        summary = "Current labels remain scaffold-level and are useful mainly for plumbing, audit, and future calibration preparation."
        viable = False
        primary_limitation = "Independent event labels are still placeholder-level and lack evidence-linked elevated coverage."

    return {
        "grade": grade,
        "summary": summary,
        "viableForIndependentSupervision": viable,
        "primaryLimitation": primary_limitation,
        "joinedPositiveRows": positive_rows,
        "joinedStrongOrModerateRows": strong_or_moderate,
        "joinedReviewedRows": reviewed_rows,
        "joinedReviewableRows": reviewable_rows,
        "joinedReviewablePositiveRows": reviewable_positive_rows,
        "backlogRows": int(backlog_summary.get("rowCount", 0)),
        "backlogPositiveRows": int(backlog_summary.get("positiveRows", 0)),
        "backlogIndependentPositiveRows": backlog_independent_positives,
        "backlogEvidenceLinkedRows": backlog_evidence_linked,
        "backlogPlaceholderEvidenceRows": backlog_placeholder_rows,
        "backlogPromotableRows": backlog_promotable,
    }


def write_label_audit_report(labels_summary: dict, backlog_summary: dict, supervision_quality: dict) -> Path:
    """Write a markdown report that explains current label coverage and weakness honestly."""

    lines = [
        "# FloodGuard Label Audit Report",
        "",
        "This report audits the current label files used to improve ML supervision credibility.",
        "",
        "## Joined Label Windows (`labels.csv`)",
        "",
        f"- Rows: {labels_summary['rowCount']}",
        f"- Time span: {labels_summary['timeSpan']['start'] or 'n/a'} to {labels_summary['timeSpan']['end'] or 'n/a'}",
        f"- Areas covered: {', '.join(labels_summary['areas']) or 'none'}",
        f"- Label sources: {labels_summary['labelSourceCounts']}",
        f"- Label strengths: {labels_summary['labelStrengthCounts']}",
        f"- Label classes: {labels_summary['labelClassCounts']}",
        f"- Review status: {labels_summary['reviewStatusCounts']}",
        f"- Evidence support status: {labels_summary['evidenceSupportStatusCounts']}",
        f"- Positive event windows: {labels_summary['positiveRows']}",
        f"- Reviewed joined rows: {labels_summary['reviewedRows']}",
        f"- Independent positive joined rows: {labels_summary['independentPositiveRows']}",
        f"- Evidence-linked joined rows: {labels_summary['evidenceLinkedRows']}",
        f"- Evidence-linked joined positive rows: {labels_summary['evidenceLinkedPositiveRows']}",
        f"- Placeholder-evidence joined rows: {labels_summary['placeholderEvidenceRows']}",
        f"- Placeholder-evidence joined positive rows: {labels_summary['placeholderEvidencePositiveRows']}",
        f"- Real-evidence joined rows: {labels_summary['realEvidenceRows']}",
        f"- Real-evidence joined positive rows: {labels_summary['realEvidencePositiveRows']}",
        f"- Reviewable joined rows: {labels_summary['reviewableRows']}",
        f"- Reviewable joined positive rows: {labels_summary['reviewablePositiveRows']}",
        f"- Reviewed joined positive rows: {labels_summary['reviewedPositiveRows']}",
        "",
        "## Event Label Backlog (`event_label_backlog.csv`)",
        "",
        f"- Rows: {backlog_summary['rowCount']}",
        f"- Time span: {backlog_summary['timeSpan']['start'] or 'n/a'} to {backlog_summary['timeSpan']['end'] or 'n/a'}",
        f"- Areas covered: {', '.join(backlog_summary['areas']) or 'none'}",
        f"- Label sources: {backlog_summary['labelSourceCounts']}",
        f"- Label strengths: {backlog_summary['labelStrengthCounts']}",
        f"- Label classes: {backlog_summary['labelClassCounts']}",
        f"- Review status: {backlog_summary['reviewStatusCounts']}",
        f"- Evidence support status: {backlog_summary['evidenceSupportStatusCounts']}",
        f"- Promotion ready: {backlog_summary['promotionReadyCounts']}",
        f"- Independence levels: {backlog_summary['independenceLevelCounts']}",
        f"- Review priorities: {backlog_summary['reviewPriorityCounts']}",
        f"- Join status: {backlog_summary['joinStatusCounts']}",
        f"- Evidence types: {backlog_summary['evidenceTypeCounts']}",
        f"- Source status counts: {backlog_summary['sourceStatusCounts']}",
        f"- Area mapping confidence counts: {backlog_summary['areaMappingConfidenceCounts']}",
        f"- Positive event windows: {backlog_summary['positiveRows']}",
        f"- Independent positive backlog rows: {backlog_summary['independentPositiveRows']}",
        f"- Evidence-linked backlog rows: {backlog_summary['evidenceLinkedRows']}",
        f"- Evidence-linked backlog positive rows: {backlog_summary['evidenceLinkedPositiveRows']}",
        f"- Placeholder-evidence backlog rows: {backlog_summary['placeholderEvidenceRows']}",
        f"- Placeholder-evidence backlog positive rows: {backlog_summary['placeholderEvidencePositiveRows']}",
        f"- Real-evidence backlog rows: {backlog_summary['realEvidenceRows']}",
        f"- Real-evidence backlog positive rows: {backlog_summary['realEvidencePositiveRows']}",
        f"- Reviewed backlog rows: {backlog_summary['reviewedRows']}",
        f"- Reviewed backlog positive rows: {backlog_summary['reviewedPositiveRows']}",
        f"- Promotion-ready backlog rows: {backlog_summary['promotableRows']}",
        f"- Reviewable backlog rows: {backlog_summary['reviewableRows']}",
        f"- Reviewable backlog positive rows: {backlog_summary['reviewablePositiveRows']}",
        "",
        "## Supervision Quality",
        "",
        f"- Grade: `{supervision_quality['grade']}`",
        f"- Viable for independent supervision: `{supervision_quality['viableForIndependentSupervision']}`",
        f"- Summary: {supervision_quality['summary']}",
        f"- Primary limitation: {supervision_quality['primaryLimitation']}",
        f"- Event-holdout currently viable: `{supervision_quality['viableForIndependentSupervision'] and supervision_quality['joinedReviewablePositiveRows'] > 0}`",
        "",
        "## Unlabelled Periods / Current Gap",
        "",
        "- Most real-export historical rows still do not have strong independently verified elevated labels.",
        "- Backlog rows are planning and review artifacts, not automatic validation evidence.",
        "- Scenario-generated rows must never be treated as real-world label evidence.",
        "",
        "## Promotion Path",
        "",
        "- Backlog candidates become stronger only after real evidence is linked, review status improves, and joined labels are refreshed.",
        "- Promotion-ready backlog rows should stay explicit so event-holdout validation can depend on reviewed evidence rather than placeholders.",
        "- Placeholder links such as `example.test` do not count as real evidence for review or promotion.",
        "- Real evidence links or explicit reviewed states are required before a label can count toward independent supervision claims.",
        "",
        "## Interpretation",
        "",
        "- FloodGuard is now stronger at tracking label provenance and strength explicitly.",
        "- FloodGuard is still weak on validated real-event supervision until backlog items are reviewed and promoted into stronger joined labels.",
        "",
    ]
    markdown = "\n".join(lines) + "\n"
    LABEL_AUDIT_REPORT.write_text(markdown, encoding="utf-8")
    LEGACY_LABEL_AUDIT_REPORT.write_text(markdown, encoding="utf-8")
    return LABEL_AUDIT_REPORT


def write_label_audit_artifacts() -> dict:
    """Generate markdown and JSON label-audit artifacts together."""

    ensure_runtime_dirs()
    labels = load_label_windows()
    backlog = load_event_backlog()
    labels_summary = summarise_label_frame(labels, "labels.csv")
    backlog_summary = summarise_label_frame(backlog, "event_label_backlog.csv")
    supervision_quality = assess_supervision_quality(labels_summary, backlog_summary)
    output_path = write_label_audit_report(labels_summary, backlog_summary, supervision_quality)
    payload = {
        "labelsSummary": labels_summary,
        "backlogSummary": backlog_summary,
        "supervisionQuality": supervision_quality,
        "markdownPath": str(output_path),
    }
    write_json(LABEL_AUDIT_JSON, payload)
    return payload


def main() -> None:
    payload = write_label_audit_artifacts()
    output_path = payload["markdownPath"]
    print(f"Label audit report written to {output_path}")


if __name__ == "__main__":
    main()
