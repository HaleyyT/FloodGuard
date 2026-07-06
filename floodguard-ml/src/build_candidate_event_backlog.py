"""Generate candidate event-review rows from stored history and source-evidence snapshots."""

from __future__ import annotations

import json
from datetime import timedelta
from pathlib import Path
from typing import Any

from audit_labels import EVENT_BACKLOG_DATASET, load_event_backlog
from build_event_review_queue import build_event_review_queue
from utils import DATA_DIR

import pandas as pd


PROJECT_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = PROJECT_ROOT.parent
FRONTEND_STORAGE_DIR = REPO_ROOT / "floodguard-frontend" / "server" / "storage"
HISTORY_DIR = FRONTEND_STORAGE_DIR / "history"
PARSED_EVIDENCE_DIR = FRONTEND_STORAGE_DIR / "source-evidence" / "parsed"

BACKLOG_COLUMNS = [
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

AREA_TERMS = {
    "parramatta": ["parramatta", "parramatta river"],
    "north-parramatta": ["north parramatta", "darling mills", "darling mills creek"],
    "toongabbie": ["toongabbie", "toongabbie creek"],
}


def parse_jsonl(path: Path) -> list[dict[str, Any]]:
    """Read newline-delimited JSON records while skipping corrupt rows safely."""

    if not path.exists():
        return []

    rows: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            payload = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(payload, dict):
            rows.append(payload)
    return rows


def backlog_frame(backlog_path: Path = EVENT_BACKLOG_DATASET) -> pd.DataFrame:
    """Load the existing backlog and guarantee the automation columns exist."""

    backlog = load_event_backlog(backlog_path)
    for column in BACKLOG_COLUMNS:
        if column not in backlog.columns:
            backlog[column] = pd.NA
    return backlog


def build_row(**values: Any) -> dict[str, Any]:
    """Create one backlog row with a stable schema."""

    row = {column: values.get(column, "") for column in BACKLOG_COLUMNS}
    row["promotion_ready"] = values.get("promotion_ready", "no")
    row["review_status"] = values.get("review_status", "candidate_review")
    row["join_status"] = values.get("join_status", "backlog_only")
    row["review_priority"] = values.get("review_priority", "medium")
    row["independence_level"] = values.get("independence_level", "moderate")
    row["evidence_support_status"] = values.get("evidence_support_status", "unknown")
    return row


def gauge_triggered(record: dict[str, Any]) -> bool:
    """Use a small, explainable trigger family for queue candidates only."""

    features = record.get("riskFeatures") or {}
    latest_rain = float(features.get("latestRainfallMm") or record.get("rainfall", {}).get("latestValidRainfallMm") or 0)
    max_recent = float(features.get("maxRecentRainfallMm") or latest_rain or 0)
    rain_24h = float(features.get("rainfall24hMm") or 0)
    rain_72h = float(features.get("rainfall72hMm") or 0)
    rising = int(features.get("risingRiverStations") or 0)
    score = float(record.get("riskScore") or 0)
    rainfall_correlated = latest_rain > 0 or rain_24h > 0 or rain_72h > 0
    return (
        latest_rain >= 10
        or (max_recent >= 10 and rainfall_correlated)
        or rain_24h >= 30
        or rain_72h >= 50
        or (rising >= 1 and score >= 35)
    )


def gauge_strength(record: dict[str, Any]) -> str:
    """Keep automatic gauge windows conservative unless multiple stronger signals align."""

    features = record.get("riskFeatures") or {}
    rain_24h = float(features.get("rainfall24hMm") or 0)
    rain_72h = float(features.get("rainfall72hMm") or 0)
    rising = int(features.get("risingRiverStations") or 0)
    if rain_24h >= 50 or rain_72h >= 80 or rising >= 2:
        return "moderate"
    return "weak"


def build_gauge_candidates(history_dir: Path = HISTORY_DIR) -> list[dict[str, Any]]:
    """Group contiguous history rows into candidate gauge-threshold windows."""

    candidates: list[dict[str, Any]] = []
    for history_path in sorted(history_dir.glob("*.jsonl")):
        records = parse_jsonl(history_path)
        if not records:
            continue

        ordered = sorted(
            records,
            key=lambda row: pd.to_datetime(row.get("ingestedAt"), errors="coerce", utc=True),
        )
        current: dict[str, Any] | None = None
        for record in ordered:
            timestamp = pd.to_datetime(record.get("ingestedAt"), errors="coerce", utc=True)
            if pd.isna(timestamp) or not gauge_triggered(record):
                if current is not None:
                    candidates.append(current)
                    current = None
                continue

            area = str(record.get("areaId") or history_path.stem)
            if current is None:
                current = {
                    "area": area,
                    "start_time": timestamp,
                    "end_time": timestamp,
                    "label_strength": gauge_strength(record),
                    "source_status": str(record.get("freshness", {}).get("status") or "history"),
                }
                continue

            gap_hours = (timestamp - current["end_time"]).total_seconds() / 3600
            if gap_hours <= 6:
                current["end_time"] = timestamp
                if gauge_strength(record) == "moderate":
                    current["label_strength"] = "moderate"
                current["source_status"] = str(
                    record.get("freshness", {}).get("status") or current["source_status"]
                )
            else:
                candidates.append(current)
                current = {
                    "area": area,
                    "start_time": timestamp,
                    "end_time": timestamp,
                    "label_strength": gauge_strength(record),
                    "source_status": str(record.get("freshness", {}).get("status") or "history"),
                }

        if current is not None:
            candidates.append(current)

    rows = []
    for candidate in candidates:
        area_title = candidate["area"].replace("-", " ").title()
        rows.append(
            build_row(
                area=candidate["area"],
                event_name=f"{area_title} gauge-threshold candidate window",
                start_time=candidate["start_time"].isoformat(),
                end_time=candidate["end_time"].isoformat(),
                label_class=1,
                label_source="gauge_threshold",
                label_strength=candidate["label_strength"],
                evidence_type="gauge_threshold",
                source_status=candidate["source_status"],
                source_reference=f"history:{candidate['area']}",
                area_mapping_confidence="high",
                matched_area_reason="Derived from the area's own stored FloodGuard history file.",
                promotion_blocked_reason="Needs a reviewed gauge archive or expert-confirmed event window before promotion.",
                notes="Automatically queued from stored rainfall/river history; review required before any label promotion.",
            )
        )
    return rows


def area_matches(text: str) -> list[str]:
    """Match simple area names and catchment hints inside collected warning/impact text."""

    normalised = text.lower()
    matches = []
    for area, terms in AREA_TERMS.items():
        if any(term in normalised for term in terms):
            matches.append(area)
    return matches


def event_window_end(start: str | None, fallback: str | None) -> str:
    """Keep event windows narrow when only one collected snapshot is available."""

    start_ts = pd.to_datetime(start, errors="coerce", utc=True)
    fallback_ts = pd.to_datetime(fallback, errors="coerce", utc=True)
    if pd.isna(start_ts) and pd.isna(fallback_ts):
        return ""
    if pd.isna(start_ts):
        return fallback_ts.isoformat()
    if pd.isna(fallback_ts):
        return (pd.Timestamp(start_ts).to_pydatetime() + timedelta(hours=3)).isoformat()
    candidate_end = pd.Timestamp(start_ts).to_pydatetime() + timedelta(hours=3)
    return (candidate_end if candidate_end >= fallback_ts else fallback_ts).isoformat()


def normalise_key_time(value: Any) -> str:
    """Convert backlog times into one stable ISO key format for rerun deduplication."""

    timestamp = pd.to_datetime(value, errors="coerce", utc=True)
    if pd.isna(timestamp):
        return str(value or "")
    return timestamp.isoformat()


def build_source_candidates(parsed_dir: Path = PARSED_EVIDENCE_DIR) -> list[dict[str, Any]]:
    """Turn collected warning and transport evidence into candidate review rows."""

    rows: list[dict[str, Any]] = []
    for evidence_path in sorted(parsed_dir.glob("*.jsonl")):
        for record in parse_jsonl(evidence_path):
            evidence_type = str(record.get("evidenceType") or "")
            if record.get("status") not in {"ok", "live", "no_relevant_warning"}:
                continue

            items = record.get("items") or []
            for item in items:
                text = " ".join(
                    [
                        str(item.get("title") or ""),
                        str(item.get("description") or ""),
                        " ".join(item.get("matchedAreas") or []),
                    ]
                ).strip()
                matched_areas = item.get("matchedAreas") or area_matches(text)
                if not matched_areas:
                    continue

                for area in matched_areas:
                    label_source = "impact_derived" if evidence_type == "impact_context" else "warning_derived"
                    label_strength = "strong" if label_source == "impact_derived" else "moderate"
                    rows.append(
                        build_row(
                            area=area,
                            event_name=str(item.get("title") or f"{area.title()} candidate event"),
                            start_time=str(item.get("observedAt") or record.get("observedAt") or record.get("fetchedAt") or ""),
                            end_time=event_window_end(
                                item.get("observedAt") or record.get("observedAt"),
                                record.get("fetchedAt"),
                            ),
                            label_class=1,
                            label_source=label_source,
                            label_strength=label_strength,
                            evidence_link=str(item.get("link") or ""),
                            evidence_type="impact_notice" if label_source == "impact_derived" else "official_warning",
                            source_status=str(record.get("status") or "unknown"),
                            source_reference=str(record.get("sourceUrl") or ""),
                            area_mapping_confidence="high",
                            matched_area_reason="Matched the area name or catchment phrase in collected source evidence.",
                            promotion_blocked_reason="Needs human review to confirm the source is real, relevant, and overlaps the local event window.",
                            review_priority="high",
                            notes="Automatically queued from collected warning/impact evidence; do not treat as reviewed supervision.",
                        )
                    )
    return rows


def candidate_key(row: dict[str, Any]) -> tuple[str, str, str, str, str]:
    """Use a narrow key so repeated automation runs do not duplicate the same candidate."""

    return (
        str(row.get("area") or ""),
        str(row.get("event_name") or ""),
        normalise_key_time(row.get("start_time")),
        normalise_key_time(row.get("end_time")),
        str(row.get("label_source") or ""),
    )


def merge_candidates(backlog: pd.DataFrame, new_rows: list[dict[str, Any]]) -> pd.DataFrame:
    """Append only genuinely new automation candidates to the backlog."""

    existing_keys = {
        candidate_key(row)
        for row in backlog[["area", "event_name", "start_time", "end_time", "label_source"]]
        .fillna("")
        .astype(str)
        .to_dict("records")
    }
    deduped_rows = []
    seen_new_keys: set[tuple[str, str, str, str, str]] = set()
    for row in new_rows:
        key = candidate_key(row)
        if key in existing_keys or key in seen_new_keys:
            continue
        deduped_rows.append(row)
        seen_new_keys.add(key)

    if not deduped_rows:
        return backlog

    additions = pd.DataFrame(deduped_rows)
    merged = pd.concat([backlog, additions], ignore_index=True)
    for column in BACKLOG_COLUMNS:
        if column not in merged.columns:
            merged[column] = pd.NA
    return merged[BACKLOG_COLUMNS]


def build_candidate_event_backlog(
    backlog_path: Path = EVENT_BACKLOG_DATASET,
    history_dir: Path = HISTORY_DIR,
    parsed_dir: Path = PARSED_EVIDENCE_DIR,
    queue_path: Path = DATA_DIR / "event_evidence_review_queue.csv",
) -> pd.DataFrame:
    """Refresh candidate evidence windows without promoting any labels automatically."""

    backlog = backlog_frame(backlog_path)
    new_rows = build_gauge_candidates(history_dir) + build_source_candidates(parsed_dir)
    merged = merge_candidates(backlog, new_rows)
    backlog_path.write_text(merged.to_csv(index=False), encoding="utf-8")
    build_event_review_queue(backlog_path=backlog_path, output_path=queue_path)
    return merged


def main() -> None:
    backlog = build_candidate_event_backlog()
    print(f"Candidate event backlog now contains {len(backlog)} row(s).")


if __name__ == "__main__":
    main()
