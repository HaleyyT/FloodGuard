"""Audit FloodGuard label files and produce a report for ML credibility review."""

from __future__ import annotations

from pathlib import Path

from build_dataset import load_label_windows
from utils import DATA_DIR, REPORTS_DIR, ensure_runtime_dirs, write_json

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
        "evidence_link",
        "notes",
    ]
    if not backlog_path.exists():
        return pd.DataFrame(columns=columns)

    backlog = pd.read_csv(backlog_path)
    if backlog.empty:
        return pd.DataFrame(columns=columns)

    backlog["start_time"] = pd.to_datetime(backlog["start_time"], errors="coerce", utc=True)
    backlog["end_time"] = pd.to_datetime(backlog["end_time"], errors="coerce", utc=True)
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

    return {
        "name": name,
        "rowCount": int(len(frame)),
        "timeSpan": {
            "start": None if starts.empty else starts.min().isoformat(),
            "end": None if ends.empty else ends.max().isoformat(),
        },
        "areas": sorted(frame["area"].dropna().astype(str).unique().tolist()),
        "labelSourceCounts": frame["label_source"].fillna("unknown").value_counts(dropna=False).to_dict(),
        "labelStrengthCounts": frame["label_strength"].fillna("unknown").value_counts(dropna=False).to_dict(),
        "reviewStatusCounts": frame.get("review_status", pd.Series(dtype="object"))
        .fillna("unknown")
        .value_counts(dropna=False)
        .to_dict(),
        "promotionReadyCounts": frame.get("promotion_ready", pd.Series(dtype="object"))
        .fillna("unknown")
        .value_counts(dropna=False)
        .to_dict(),
        "positiveRows": positives,
    }


def assess_supervision_quality(labels_summary: dict, backlog_summary: dict) -> dict:
    """Summarise whether FloodGuard has credible independent supervision yet."""

    positive_rows = int(labels_summary.get("positiveRows", 0))
    strong_or_moderate = int(labels_summary.get("labelStrengthCounts", {}).get("strong", 0)) + int(
        labels_summary.get("labelStrengthCounts", {}).get("moderate", 0)
    )
    reviewed_rows = int(labels_summary.get("reviewStatusCounts", {}).get("reviewed_for_shadow_mode", 0)) + int(
        labels_summary.get("reviewStatusCounts", {}).get("expert_validated", 0)
    )

    if positive_rows > 0 and strong_or_moderate > 0 and reviewed_rows > 0:
        grade = "reviewable"
        summary = "Independent labels are strong enough for shadow-mode event supervision review."
        viable = True
    elif positive_rows > 0 or strong_or_moderate > 0:
        grade = "developing"
        summary = "Independent label scaffolding exists, but coverage or review quality is still too weak for validated ML claims."
        viable = False
    else:
        grade = "weak"
        summary = "Current labels remain scaffold-level and are useful mainly for plumbing, audit, and future calibration preparation."
        viable = False

    return {
        "grade": grade,
        "summary": summary,
        "viableForIndependentSupervision": viable,
        "joinedPositiveRows": positive_rows,
        "joinedStrongOrModerateRows": strong_or_moderate,
        "joinedReviewedRows": reviewed_rows,
        "backlogRows": int(backlog_summary.get("rowCount", 0)),
        "backlogPositiveRows": int(backlog_summary.get("positiveRows", 0)),
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
        f"- Review status: {labels_summary['reviewStatusCounts']}",
        f"- Positive event windows: {labels_summary['positiveRows']}",
        "",
        "## Event Label Backlog (`event_label_backlog.csv`)",
        "",
        f"- Rows: {backlog_summary['rowCount']}",
        f"- Time span: {backlog_summary['timeSpan']['start'] or 'n/a'} to {backlog_summary['timeSpan']['end'] or 'n/a'}",
        f"- Areas covered: {', '.join(backlog_summary['areas']) or 'none'}",
        f"- Label sources: {backlog_summary['labelSourceCounts']}",
        f"- Label strengths: {backlog_summary['labelStrengthCounts']}",
        f"- Review status: {backlog_summary['reviewStatusCounts']}",
        f"- Promotion ready: {backlog_summary['promotionReadyCounts']}",
        f"- Positive event windows: {backlog_summary['positiveRows']}",
        "",
        "## Supervision Quality",
        "",
        f"- Grade: `{supervision_quality['grade']}`",
        f"- Viable for independent supervision: `{supervision_quality['viableForIndependentSupervision']}`",
        f"- Summary: {supervision_quality['summary']}",
        "",
        "## Unlabelled Periods / Current Gap",
        "",
        "- Most real-export historical rows still do not have strong independently verified elevated labels.",
        "- Backlog rows are planning and review artifacts, not automatic validation evidence.",
        "- Scenario-generated rows must never be treated as real-world label evidence.",
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
