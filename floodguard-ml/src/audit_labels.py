"""Audit FloodGuard label files and produce a report for ML credibility review."""

from __future__ import annotations

from pathlib import Path

from build_dataset import load_label_windows
from utils import DATA_DIR, REPORTS_DIR, ensure_runtime_dirs

import pandas as pd


EVENT_BACKLOG_DATASET = DATA_DIR / "event_label_backlog.csv"
LABEL_AUDIT_REPORT = REPORTS_DIR / "label_audit_report.md"


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
        "positiveRows": positives,
    }


def write_label_audit_report(labels_summary: dict, backlog_summary: dict) -> Path:
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
        f"- Positive event windows: {labels_summary['positiveRows']}",
        "",
        "## Event Label Backlog (`event_label_backlog.csv`)",
        "",
        f"- Rows: {backlog_summary['rowCount']}",
        f"- Time span: {backlog_summary['timeSpan']['start'] or 'n/a'} to {backlog_summary['timeSpan']['end'] or 'n/a'}",
        f"- Areas covered: {', '.join(backlog_summary['areas']) or 'none'}",
        f"- Label sources: {backlog_summary['labelSourceCounts']}",
        f"- Label strengths: {backlog_summary['labelStrengthCounts']}",
        f"- Positive event windows: {backlog_summary['positiveRows']}",
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
    LABEL_AUDIT_REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return LABEL_AUDIT_REPORT


def main() -> None:
    ensure_runtime_dirs()
    labels = load_label_windows()
    backlog = load_event_backlog()
    labels_summary = summarise_label_frame(labels, "labels.csv")
    backlog_summary = summarise_label_frame(backlog, "event_label_backlog.csv")
    output_path = write_label_audit_report(labels_summary, backlog_summary)
    print(f"Label audit report written to {output_path}")


if __name__ == "__main__":
    main()
