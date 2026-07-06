"""Attach real FloodSmart gauge evidence packs to candidate windows without overstating review quality."""

from __future__ import annotations

import json
import ssl
from dataclasses import dataclass
from datetime import timedelta
from pathlib import Path
from typing import Any
from urllib.parse import urlencode, urlparse, urlunparse
from urllib.request import urlopen

from audit_labels import EVENT_BACKLOG_DATASET, load_event_backlog, write_label_audit_artifacts
from build_event_review_queue import build_event_review_queue
from promote_reviewed_labels import promote_reviewed_labels
from utils import LABELS_DATASET, REPORTS_DIR, ensure_runtime_dirs

import pandas as pd
import certifi


PROJECT_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = PROJECT_ROOT.parent
LATEST_SIGNALS_PATH = REPO_ROOT / "floodguard-frontend/server/storage/latest-signals.json"
EVIDENCE_DIR = PROJECT_ROOT / "data/review_evidence"
REPORT_PATH = REPORTS_DIR / "gauge_evidence_review.md"

REVIEWED_BY = "codex_gauge_evidence_review"
DEFAULT_LOOKBACK_HOURS = 6
MAX_REVIEW_ROWS = 5


@dataclass
class GaugeEvidenceResult:
    area: str
    start_time: str
    end_time: str
    station_name: str
    evidence_link: str
    archived_path: str
    support_status: str
    non_zero_count: int
    max_value: float
    total_value: float
    review_status: str
    promotion_ready: str
    promotion_blocked_reason: str


def load_latest_signals(path: Path | None = None) -> dict[str, Any]:
    """Load the latest signal snapshot so evidence links point to real configured gauges."""

    path = path or LATEST_SIGNALS_PATH
    return json.loads(path.read_text(encoding="utf-8"))


def rainfall_timeseries_map(latest_signals: dict[str, Any]) -> dict[str, dict[str, str]]:
    """Map each configured area to its current FloodSmart rainfall series."""

    areas = latest_signals.get("areas", {})
    mapping: dict[str, dict[str, str]] = {}
    for area_id, area_payload in areas.items():
        rainfall = area_payload.get("rainfallSeries") or {}
        timeseries_url = str(rainfall.get("timeseriesName") or "").strip()
        station_name = str(rainfall.get("stationName") or area_id).strip()
        if timeseries_url:
            mapping[area_id] = {
                "timeseriesUrl": timeseries_url,
                "stationName": station_name,
            }
    return mapping


def canonical_events_url(timeseries_url: str, start_time: pd.Timestamp, end_time: pd.Timestamp) -> str:
    """Convert a FloodSmart timeseries URL into a stable event-query URL for review."""

    parsed = urlparse(timeseries_url)
    path = parsed.path if parsed.path.endswith("/") else f"{parsed.path}/"
    if "/timeseries/" in path and not path.endswith("/events/"):
        path = f"{path}events/"
    query = urlencode(
        {
            "format": "json",
            "ordering": "time",
            "time__gte": start_time.isoformat().replace("+00:00", "Z"),
            "time__lte": end_time.isoformat().replace("+00:00", "Z"),
            "page_size": 500,
        }
    )
    return urlunparse((parsed.scheme, parsed.netloc, path, "", query, ""))


def fetch_json(url: str) -> dict[str, Any]:
    """Fetch a small JSON evidence payload from the public gauge archive."""

    ssl_context = ssl.create_default_context(cafile=certifi.where())
    with urlopen(url, timeout=30, context=ssl_context) as response:
        return json.loads(response.read().decode("utf-8"))


def evidence_summary(payload: dict[str, Any]) -> dict[str, Any]:
    """Summarise whether the fetched gauge archive actually supports the candidate window."""

    results = payload.get("results") or []
    values = [float(item.get("value") or 0) for item in results]
    non_zero = [item for item in results if float(item.get("value") or 0) > 0]
    return {
        "rowCount": len(results),
        "nonZeroCount": len(non_zero),
        "maxValue": max(values) if values else 0.0,
        "totalValue": round(sum(values), 3),
        "firstNonZeroTime": non_zero[0]["time"] if non_zero else None,
        "lastNonZeroTime": non_zero[-1]["time"] if non_zero else None,
    }


def archive_evidence_payload(area: str, start_time: pd.Timestamp, payload: dict[str, Any]) -> Path:
    """Persist the raw evidence so future review does not depend on a moving live endpoint."""

    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    filename = (
        f"{area}_{start_time.isoformat().replace(':', '-').replace('+00:00', 'Z')}_gauge_evidence.json"
    )
    path = EVIDENCE_DIR / filename
    path.write_text(f"{json.dumps(payload, indent=2)}\n", encoding="utf-8")
    return path


def gauge_candidate_mask(backlog: pd.DataFrame) -> pd.Series:
    """Select backlog-only gauge candidates that still need a real evidence pack."""

    if backlog.empty:
        return pd.Series(dtype="bool")

    evidence_link = backlog.get("evidence_link", pd.Series(index=backlog.index, dtype="object"))
    label_source = backlog.get("label_source", pd.Series(index=backlog.index, dtype="object"))
    join_status = backlog.get("join_status", pd.Series(index=backlog.index, dtype="object"))
    return (
        label_source.fillna("unknown").astype(str).eq("gauge_threshold")
        & join_status.fillna("backlog_only").astype(str).eq("backlog_only")
        & evidence_link.fillna("").astype(str).str.strip().eq("")
    )


def review_gauge_candidates(
    backlog_path: Path = EVENT_BACKLOG_DATASET,
    labels_path: Path = LABELS_DATASET,
    max_rows: int = MAX_REVIEW_ROWS,
    lookback_hours: int = DEFAULT_LOOKBACK_HOURS,
) -> list[GaugeEvidenceResult]:
    """Attach real FloodSmart gauge evidence links and archive payloads for review."""

    ensure_runtime_dirs()
    latest_signals = load_latest_signals()
    timeseries_by_area = rainfall_timeseries_map(latest_signals)
    backlog = load_event_backlog(backlog_path)
    for column in [
        "evidence_link",
        "evidence_type",
        "source_reference",
        "evidence_support_status",
        "review_notes",
        "reviewer",
        "reviewed_at",
        "promotion_ready",
        "promotion_blocked_reason",
    ]:
        if column in backlog.columns:
            backlog[column] = backlog[column].astype("object")
    candidate_rows = backlog.loc[gauge_candidate_mask(backlog)].head(max_rows).copy()
    if candidate_rows.empty:
        write_review_report([])
        return []

    reviewed_at = pd.Timestamp.utcnow().isoformat()
    results: list[GaugeEvidenceResult] = []
    for index, row in candidate_rows.iterrows():
        area = str(row["area"])
        if area not in timeseries_by_area:
            continue

        station_name = timeseries_by_area[area]["stationName"]
        start_time = pd.to_datetime(row["start_time"], errors="coerce", utc=True)
        end_time = pd.to_datetime(row["end_time"], errors="coerce", utc=True)
        if pd.isna(start_time) or pd.isna(end_time):
            continue

        query_start = start_time - timedelta(hours=lookback_hours)
        evidence_link = canonical_events_url(timeseries_by_area[area]["timeseriesUrl"], query_start, end_time)
        payload = fetch_json(evidence_link)
        summary = evidence_summary(payload)
        archive_path = archive_evidence_payload(area, start_time, payload)

        support_status = "confirmed" if summary["nonZeroCount"] > 0 else "mismatch"
        review_status = "candidate_review"
        promotion_ready = "no"
        blocked_reason = (
            "Gauge archive linked, but the fetched review window still returns zero rainfall values; "
            "do not promote without stronger corroborating evidence."
            if support_status == "mismatch"
            else "Gauge archive linked and ready for human review before any manual promotion."
        )
        review_notes = (
            f"Gauge review pack archived from {station_name}. "
            f"Rows={summary['rowCount']}, nonZero={summary['nonZeroCount']}, "
            f"max={summary['maxValue']}, total={summary['totalValue']}."
        )

        backlog.loc[index, "evidence_link"] = evidence_link
        backlog.loc[index, "evidence_type"] = "gauge_archive_query"
        backlog.loc[index, "source_reference"] = station_name
        backlog.loc[index, "evidence_support_status"] = support_status
        backlog.loc[index, "review_notes"] = review_notes
        backlog.loc[index, "reviewer"] = REVIEWED_BY
        backlog.loc[index, "reviewed_at"] = reviewed_at
        backlog.loc[index, "promotion_ready"] = promotion_ready
        backlog.loc[index, "promotion_blocked_reason"] = blocked_reason

        results.append(
            GaugeEvidenceResult(
                area=area,
                start_time=str(row["start_time"]),
                end_time=str(row["end_time"]),
                station_name=station_name,
                evidence_link=evidence_link,
                archived_path=str(archive_path),
                support_status=support_status,
                non_zero_count=int(summary["nonZeroCount"]),
                max_value=float(summary["maxValue"]),
                total_value=float(summary["totalValue"]),
                review_status=review_status,
                promotion_ready=promotion_ready,
                promotion_blocked_reason=blocked_reason,
            )
        )

    backlog.to_csv(backlog_path, index=False)
    build_event_review_queue(backlog_path=backlog_path)
    write_review_report(results)
    write_label_audit_artifacts()
    promotion_result = promote_reviewed_labels(backlog_path=backlog_path, labels_path=labels_path)
    write_review_report(results, promotion_result=promotion_result)
    return results


def write_review_report(
    results: list[GaugeEvidenceResult], promotion_result: dict[str, Any] | None = None
) -> None:
    """Summarise which gauge rows now have real evidence and whether any were promotable."""

    lines = [
        "# FloodGuard Gauge Evidence Review",
        "",
        "This report records real FloodSmart gauge evidence packs attached to candidate backlog windows.",
        "",
    ]
    if not results:
        lines.extend(
            [
                "No backlog-only gauge candidates required evidence attachment in this run.",
                "",
            ]
        )
    else:
        lines.extend(
            [
                "## Summary",
                "",
                f"- Gauge candidates reviewed: {len(results)}",
                f"- Evidence-confirmed windows: {sum(1 for item in results if item.support_status == 'confirmed')}",
                f"- Evidence-mismatch windows: {sum(1 for item in results if item.support_status == 'mismatch')}",
                "",
                "## Reviewed Gauge Windows",
                "",
            ]
        )
        for item in results:
            lines.extend(
                [
                    f"### {item.area} | {item.start_time} to {item.end_time}",
                    "",
                    f"- Station: `{item.station_name}`",
                    f"- Evidence link: {item.evidence_link}",
                    f"- Archived payload: `{item.archived_path}`",
                    f"- Evidence support status: `{item.support_status}`",
                    f"- Non-zero rows: {item.non_zero_count}",
                    f"- Max value: {item.max_value}",
                    f"- Total rainfall: {item.total_value}",
                    f"- Promotion blocked reason: {item.promotion_blocked_reason}",
                    "",
                ]
            )

    if promotion_result is not None:
        lines.extend(
            [
                "## Promotion Outcome",
                "",
                f"- Promoted rows after evidence attachment: {promotion_result.get('promotedCount', 0)}",
                f"- Reviewed joined event windows: {promotion_result.get('reviewedEventWindows', 0)}",
                f"- Reviewed joined elevated event windows: {promotion_result.get('reviewedElevatedEventWindows', 0)}",
                "",
                "FloodGuard ML remains shadow mode unless evidence-backed reviewed windows become genuinely defensible.",
                "",
            ]
        )

    REPORT_PATH.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    results = review_gauge_candidates()
    print(f"Reviewed {len(results)} gauge candidate window(s).")


if __name__ == "__main__":
    main()
