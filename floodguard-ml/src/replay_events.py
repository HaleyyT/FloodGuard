"""Build replayable historical artifacts for FloodGuard's calibration and review work."""

from __future__ import annotations

import argparse
import json
import math
import sqlite3
from pathlib import Path
from typing import Any

from build_dataset import build_training_dataset, load_label_windows
from utils import (
    DEFAULT_DATASET,
    EVENT_LABEL_AVAILABLE_COLUMN,
    EVENT_LABEL_SOURCE_COLUMN,
    EVENT_LABEL_STRENGTH_COLUMN,
    EVENT_TARGET_COLUMN,
    FEATURE_COLUMNS,
    GROUP_TIMESTAMP_COLUMN,
    LABEL_COLUMN,
    LABEL_SOURCE_COLUMN,
    REPORTS_DIR,
    RULE_LABEL_SOURCE_COLUMN,
    RULE_TARGET_COLUMN,
    build_dataset_summary,
    confidence_band_for_probability,
    ensure_runtime_dirs,
    feature_columns_for_training,
    load_dataset,
)

PROJECT_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = PROJECT_ROOT.parent
FRONTEND_ROOT = REPO_ROOT / "floodguard-frontend"
HISTORY_DIR = FRONTEND_ROOT / "server/storage/history"
SQLITE_PATH = REPO_ROOT / "floodguard-data/floodguard_history.sqlite"
REPORT_PATH = REPORTS_DIR / "history_replay_report.md"
EVENT_REPORT_PATH = REPORTS_DIR / "event_replay_report.md"
SUMMARY_JSON_PATH = REPORTS_DIR / "history_replay_summary.json"
ML_REPORT_PATH = REPORTS_DIR / "real_export_metrics.json"


def parse_args() -> argparse.Namespace:
    """Collect a small set of replay options without complicating the normal workflow."""

    parser = argparse.ArgumentParser(
        description="Replay FloodGuard history into SQLite and a human-readable audit report."
    )
    parser.add_argument(
        "--area",
        dest="area_id",
        default=None,
        help="Optional area id filter such as parramatta or toongabbie.",
    )
    parser.add_argument(
        "--sqlite",
        dest="sqlite_path",
        type=Path,
        default=SQLITE_PATH,
        help="Where the replayable SQLite database should be written.",
    )
    parser.add_argument(
        "--report",
        dest="report_path",
        type=Path,
        default=REPORT_PATH,
        help="Where the markdown replay report should be written.",
    )
    parser.add_argument(
        "--event-report",
        dest="event_report_path",
        type=Path,
        default=EVENT_REPORT_PATH,
        help="Where the event-window replay report should be written.",
    )
    return parser.parse_args()


def iso_timestamp(value: Any) -> str | None:
    """Keep timestamps as stable ISO strings when possible and ignore malformed inputs."""

    if value is None:
        return None
    text = str(value).strip()
    return text or None


def json_safe(value: Any) -> Any:
    """Convert Pandas/NumPy-style NaN values into JSON-safe nulls before writing reports."""

    if isinstance(value, float) and math.isnan(value):
        return None
    if isinstance(value, dict):
        return {key: json_safe(item) for key, item in value.items()}
    if isinstance(value, list):
        return [json_safe(item) for item in value]
    return value


def snapshot_key(area_id: str, observed_at: str | None) -> str:
    """Use a deterministic composite key across history, labels, and model outputs."""

    return f"{area_id}|{observed_at or 'unknown'}"


def load_jsonl_history(history_dir: Path = HISTORY_DIR, area_id: str | None = None) -> list[dict[str, Any]]:
    """Load committed JSONL history and preserve older lean records alongside newer richer ones."""

    if not history_dir.exists():
        return []

    paths = (
        [history_dir / f"{area_id}.jsonl"]
        if area_id
        else sorted(path for path in history_dir.glob("*.jsonl") if path.is_file())
    )
    records: list[dict[str, Any]] = []
    for path in paths:
        if not path.exists():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            payload = json.loads(line)
            payload["_historyAreaId"] = payload.get("areaId") or path.stem
            records.append(payload)
    records.sort(
        key=lambda record: (
            record.get("areaId") or record.get("_historyAreaId") or "",
            record.get("ingestedAt") or "",
        )
    )
    return records


def flatten_source_readings(record: dict[str, Any]) -> list[dict[str, Any]]:
    """Support both recent sourceReadings snapshots and older history rows with only rainfall/river fields."""

    if record.get("sourceReadings"):
        rows = []
        for reading in record["sourceReadings"]:
            rows.append(
                {
                    "stationId": reading.get("stationId"),
                    "signalType": reading.get("signalType"),
                    "value": reading.get("value"),
                    "unit": reading.get("unit"),
                    "observedAt": iso_timestamp(reading.get("observedAt")),
                    "fetchedAt": iso_timestamp(reading.get("fetchedAt")),
                    "sourceName": reading.get("sourceName"),
                    "sourceStrength": reading.get("sourceStrength"),
                    "dataMode": reading.get("dataMode"),
                    "freshnessStatus": reading.get("freshnessStatus"),
                }
            )
        return rows

    rainfall = record.get("rainfall") or {}
    river = record.get("river") or {}
    fallback_rows = []
    if rainfall:
        fallback_rows.append(
            {
                "stationId": rainfall.get("stationNumber") or rainfall.get("sourceLabel"),
                "signalType": "rainfall",
                "value": rainfall.get("latestValidRainfallMm"),
                "unit": "mm",
                "observedAt": iso_timestamp(rainfall.get("latestPointTime")),
                "fetchedAt": iso_timestamp(record.get("ingestedAt")),
                "sourceName": rainfall.get("sourceLabel") or "historical-rainfall",
                "sourceStrength": None,
                "dataMode": None,
                "freshnessStatus": (record.get("freshness") or {}).get("status"),
            }
        )
    if river:
        fallback_rows.append(
            {
                "stationId": river.get("primaryStationName"),
                "signalType": "river",
                "value": river.get("primaryHeightM"),
                "unit": "m",
                "observedAt": iso_timestamp(river.get("issuedDate")),
                "fetchedAt": iso_timestamp(record.get("ingestedAt")),
                "sourceName": river.get("primaryStationName") or "historical-river",
                "sourceStrength": None,
                "dataMode": None,
                "freshnessStatus": (record.get("freshness") or {}).get("status"),
            }
        )
    return fallback_rows


def flatten_source_status(record: dict[str, Any]) -> list[dict[str, Any]]:
    """Track per-source freshness and fallback state so degraded decisions can be replayed later."""

    freshness_rows = record.get("sourceFreshness") or []
    if freshness_rows:
        rows = []
        for source in freshness_rows:
            rows.append(
                {
                    "sourceType": source.get("type"),
                    "label": source.get("label"),
                    "mode": source.get("mode"),
                    "freshnessStatus": source.get("freshnessStatus"),
                    "observedAt": iso_timestamp(source.get("observedAt")),
                    "ageHours": source.get("ageHours"),
                }
            )
        return rows

    freshness = record.get("freshness") or {}
    return [
        {
            "sourceType": "aggregate",
            "label": "legacy-history-summary",
            "mode": None,
            "freshnessStatus": freshness.get("status"),
            "observedAt": iso_timestamp(record.get("ingestedAt")),
            "ageHours": None,
        }
    ]


def best_rule_level(rows: list[dict[str, Any]]) -> str:
    """Reduce a window of rule outputs into the highest concern seen in that interval."""

    priority = {"Low": 0, "Moderate": 1, "High": 2}
    return max(
        (row.get("ruleConcernLevel", "Low") for row in rows),
        key=lambda level: priority.get(level, -1),
        default="Low",
    )


def default_windows(dataframe) -> list[dict[str, Any]]:
    """Fallback to one window per area when the label backlog still lacks event-style intervals."""

    windows = []
    if dataframe.empty:
        return windows
    for area_id, area_rows in dataframe.groupby("areaId"):
        start = area_rows[GROUP_TIMESTAMP_COLUMN].min()
        end = area_rows[GROUP_TIMESTAMP_COLUMN].max()
        windows.append(
            {
                "area": area_id,
                "start_time": None if start is None else start.isoformat(),
                "end_time": None if end is None else end.isoformat(),
                "label": None,
                "label_source": "history_range_fallback",
                "label_strength": "unknown",
                "review_status": "history_range_fallback",
                "evidence_link": None,
                "notes": "Replay window created from available history because labelled event windows are sparse.",
            }
        )
    return windows


def load_replay_windows(dataframe) -> list[dict[str, Any]]:
    """Prefer label-window replay but degrade safely to area-wide history slices."""

    label_rows = load_label_windows()
    if label_rows.empty:
        return default_windows(dataframe)

    windows = []
    for _, row in label_rows.iterrows():
        windows.append(
            {
                "area": row.get("areaJoinKey") or row.get("area"),
                "start_time": None if row.get("start_time") is None else row["start_time"].isoformat(),
                "end_time": None if row.get("end_time") is None else row["end_time"].isoformat(),
                "label": None if row.get("label") is None else int(row["label"]),
                "label_source": row.get("label_source"),
                "label_strength": row.get("label_strength"),
                "review_status": row.get("review_status"),
                "evidence_link": row.get("evidence_link"),
                "notes": row.get("notes"),
            }
        )
    return windows


def event_evidence_quality(window: dict[str, Any]) -> str:
    """Classify replay-window evidence without promoting placeholder labels."""

    review_status = str(window.get("review_status") or "unknown")
    evidence_link = str(window.get("evidence_link") or "").strip()
    if evidence_link.lower() in {"", "nan", "none", "<na>"}:
        evidence_link = ""
    if review_status in {"reviewed_for_shadow_mode", "expert_validated"}:
        return "reviewed"
    if "example.test" in evidence_link.lower() or evidence_link.lower().startswith("placeholder:"):
        return "placeholder"
    if evidence_link:
        return "real_evidence_candidate"
    return "no_evidence"


def event_window_limitations(window: dict[str, Any]) -> list[str]:
    """Keep event replay limitations local to each window."""

    limitations = []
    quality = event_evidence_quality(window)
    review_status = str(window.get("review_status") or "unknown")
    if quality == "placeholder":
        limitations.append("Evidence link is a placeholder and cannot validate this event window.")
    if quality == "no_evidence":
        limitations.append("No evidence link is attached to this replay window.")
    if review_status == "candidate_review":
        limitations.append("Window is candidate_review only and must not count as reviewed supervision.")
    if review_status == "scaffold_only":
        limitations.append("Window is scaffold_only and exists for plumbing or baseline context.")
    if review_status not in {"reviewed_for_shadow_mode", "expert_validated"}:
        limitations.append("Replay supports review, not event-holdout validation.")
    return limitations


def load_model_bundle(report_path: Path = ML_REPORT_PATH) -> dict[str, Any] | None:
    """Load the best available real-export model bundle for shadow replay comparisons."""

    if report_path.exists():
        report = json.loads(report_path.read_text(encoding="utf-8"))
        model_name = report.get("bestPrototypeModel")
        if model_name:
            candidate = PROJECT_ROOT / "models" / "real_export" / f"{model_name}.joblib"
            if candidate.exists():
                from utils import joblib

                return joblib.load(candidate)

    for fallback_name in ["logistic_regression", "random_forest", "extra_trees"]:
        candidate = PROJECT_ROOT / "models" / "real_export" / f"{fallback_name}.joblib"
        if candidate.exists():
            from utils import joblib

            return joblib.load(candidate)

    return None


def score_shadow_predictions(dataframe) -> dict[str, dict[str, Any]]:
    """Score the historical dataset with the saved shadow model when artifacts exist."""

    model_bundle = load_model_bundle()
    if model_bundle is None or dataframe.empty:
        return {}

    pipeline = model_bundle["pipeline"]
    model_name = model_bundle["modelName"]
    feature_columns = model_bundle.get("featureColumns")
    if not feature_columns:
        feature_columns, _, _ = feature_columns_for_training(dataframe)
    feature_frame = dataframe[feature_columns].copy()
    predictions = pipeline.predict(feature_frame)
    probabilities = pipeline.predict_proba(feature_frame)[:, 1]
    summary = build_dataset_summary(dataframe, "history_replay_shadow")

    scored: dict[str, dict[str, Any]] = {}
    for index, (_, row) in enumerate(dataframe.iterrows()):
        probability = float(probabilities[index])
        confidence = confidence_band_for_probability(
            probability,
            summary.get("targetCounts", {}).get("1", 0),
            summary.get("rowCount", 0),
            summary.get("labelSourceCounts", {}),
        )
        key = snapshot_key(row["areaId"], row[GROUP_TIMESTAMP_COLUMN].isoformat())
        scored[key] = {
            "modelName": model_name,
            "predictedLabel": int(predictions[index]),
            "predictedProbability": probability,
            "confidenceBand": confidence["band"],
            "confidenceReason": confidence["reason"],
        }
    return scored


def ensure_tables(connection: sqlite3.Connection) -> None:
    """Create the short-term replay schema that keeps query paths simple and explicit."""

    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS readings (
          snapshot_id TEXT,
          area_id TEXT,
          observed_at TEXT,
          signal_type TEXT,
          station_id TEXT,
          value REAL,
          unit TEXT,
          source_name TEXT,
          source_strength TEXT,
          data_mode TEXT,
          freshness_status TEXT,
          reading_observed_at TEXT,
          fetched_at TEXT
        );

        CREATE TABLE IF NOT EXISTS source_status (
          snapshot_id TEXT,
          area_id TEXT,
          observed_at TEXT,
          source_type TEXT,
          source_label TEXT,
          mode TEXT,
          freshness_status TEXT,
          source_observed_at TEXT,
          age_hours REAL
        );

        CREATE TABLE IF NOT EXISTS features (
          snapshot_id TEXT,
          area_id TEXT,
          observed_at TEXT,
          rainfall_1h_mm REAL,
          rainfall_3h_mm REAL,
          rainfall_24h_mm REAL,
          rainfall_72h_mm REAL,
          antecedent_wetness_mm REAL,
          river_latest_m REAL,
          river_delta_1h_m REAL,
          river_delta_3h_m REAL,
          rate_of_rise_m_per_hour REAL,
          data_freshness_score REAL,
          source_coverage REAL,
          warning_active INTEGER,
          area_relevance_score REAL,
          nearest_station_distance_km REAL
        );

        CREATE TABLE IF NOT EXISTS risk_assessments (
          snapshot_id TEXT,
          area_id TEXT,
          observed_at TEXT,
          rule_concern_level TEXT,
          rule_target INTEGER,
          risk_score REAL,
          decision_reliability_score REAL,
          selected_target_kind TEXT,
          label_source TEXT
        );

        CREATE TABLE IF NOT EXISTS warnings (
          snapshot_id TEXT,
          area_id TEXT,
          observed_at TEXT,
          warning_status TEXT,
          warning_active INTEGER
        );

        CREATE TABLE IF NOT EXISTS labels (
          snapshot_id TEXT,
          area_id TEXT,
          observed_at TEXT,
          rule_target INTEGER,
          event_target INTEGER,
          rule_label_source TEXT,
          event_label_source TEXT,
          event_label_strength TEXT,
          event_label_available INTEGER
        );

        CREATE TABLE IF NOT EXISTS model_predictions (
          snapshot_id TEXT,
          area_id TEXT,
          observed_at TEXT,
          model_name TEXT,
          predicted_label INTEGER,
          predicted_probability REAL,
          confidence_band TEXT,
          confidence_reason TEXT
        );

        CREATE TABLE IF NOT EXISTS decision_audits (
          snapshot_id TEXT,
          area_id TEXT,
          observed_at TEXT,
          evidence_confidence TEXT,
          official_warning_context TEXT,
          recommendation_type TEXT,
          recommendation_note TEXT,
          hazard_pressure_json TEXT,
          increased_concern_json TEXT,
          reduced_concern_json TEXT,
          excluded_evidence_json TEXT,
          source_limitations_json TEXT,
          check_next_json TEXT
        );
        """
    )


def write_replay_sqlite(
    history_records: list[dict[str, Any]],
    dataset,
    scored_predictions: dict[str, dict[str, Any]],
    sqlite_path: Path,
) -> Path:
    """Persist replayable history into a lightweight relational layout for short-term querying."""

    sqlite_path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(sqlite_path) as connection:
        ensure_tables(connection)
        connection.executescript(
            """
            DELETE FROM readings;
            DELETE FROM source_status;
            DELETE FROM features;
            DELETE FROM risk_assessments;
            DELETE FROM warnings;
            DELETE FROM labels;
            DELETE FROM model_predictions;
            DELETE FROM decision_audits;
            """
        )

        dataset_rows = {
            snapshot_key(row["areaId"], row[GROUP_TIMESTAMP_COLUMN].isoformat()): row
            for _, row in dataset.iterrows()
        }

        for record in history_records:
            area_id = record.get("areaId") or record.get("_historyAreaId")
            observed_at = iso_timestamp(record.get("ingestedAt"))
            key = snapshot_key(area_id, observed_at)
            training_row = dataset_rows.get(key)

            for reading in flatten_source_readings(record):
                connection.execute(
                    """
                    INSERT INTO readings VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        key,
                        area_id,
                        observed_at,
                        reading.get("signalType"),
                        reading.get("stationId"),
                        reading.get("value"),
                        reading.get("unit"),
                        reading.get("sourceName"),
                        reading.get("sourceStrength"),
                        reading.get("dataMode"),
                        reading.get("freshnessStatus"),
                        reading.get("observedAt"),
                        reading.get("fetchedAt"),
                    ),
                )

            for source in flatten_source_status(record):
                connection.execute(
                    """
                    INSERT INTO source_status VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        key,
                        area_id,
                        observed_at,
                        source.get("sourceType"),
                        source.get("label"),
                        source.get("mode"),
                        source.get("freshnessStatus"),
                        source.get("observedAt"),
                        source.get("ageHours"),
                    ),
                )

            features = record.get("riskFeatures") or {}
            connection.execute(
                """
                INSERT INTO features VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    key,
                    area_id,
                    observed_at,
                    training_row["rainfall1hMm"] if training_row is not None else features.get("rainfall1hMm"),
                    training_row["rainfall3hMm"] if training_row is not None else features.get("rainfall3hMm"),
                    training_row["rainfall24hMm"] if training_row is not None else features.get("rainfall24hMm"),
                    training_row["rainfall72hMm"] if training_row is not None else features.get("rainfall72hMm"),
                    training_row["antecedentWetnessMm"] if training_row is not None else features.get("antecedentWetnessMm"),
                    training_row["riverLatestM"] if training_row is not None else features.get("riverLatestM"),
                    training_row["riverDelta1hM"] if training_row is not None else features.get("riverDelta1hM"),
                    training_row["riverDelta3hM"] if training_row is not None else features.get("riverDelta3hM"),
                    training_row["rateOfRiseMPerHour"] if training_row is not None else None,
                    training_row["dataFreshnessScore"] if training_row is not None else features.get("dataFreshnessScore"),
                    training_row["sourceCoverage"] if training_row is not None else features.get("sourceCoverage"),
                    training_row["warningActive"] if training_row is not None else 0,
                    training_row["areaRelevanceScore"] if training_row is not None else record.get("areaRelevance", {}).get("score"),
                    training_row["nearestStationDistanceKm"] if training_row is not None else record.get("spatialRelevance", {}).get("nearestStationDistanceKm"),
                ),
            )

            rule_target = (
                int(training_row[RULE_TARGET_COLUMN])
                if training_row is not None and training_row.get(RULE_TARGET_COLUMN) is not None
                else int(record.get("riskLevel") in {"Moderate", "High"})
            )
            connection.execute(
                """
                INSERT INTO risk_assessments VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    key,
                    area_id,
                    observed_at,
                    training_row["ruleConcernLevel"] if training_row is not None else record.get("riskLevel"),
                    rule_target,
                    training_row["riskScore"] if training_row is not None else record.get("riskScore"),
                    training_row["decisionReliabilityScore"] if training_row is not None else (record.get("decisionReliability") or {}).get("score"),
                    training_row.get("selectedTrainingTargetKind") if training_row is not None else "rule",
                    training_row[LABEL_SOURCE_COLUMN] if training_row is not None else "rule_derived",
                ),
            )

            connection.execute(
                """
                INSERT INTO warnings VALUES (?, ?, ?, ?, ?)
                """,
                (
                    key,
                    area_id,
                    observed_at,
                    training_row["warningStatus"] if training_row is not None and "warningStatus" in training_row else (record.get("warningSummary") or {}).get("status"),
                    int(training_row["warningActive"]) if training_row is not None and "warningActive" in training_row else 0,
                ),
            )

            connection.execute(
                """
                INSERT INTO labels VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    key,
                    area_id,
                    observed_at,
                    rule_target,
                    None
                    if training_row is None or training_row.get(EVENT_TARGET_COLUMN) != training_row.get(EVENT_TARGET_COLUMN)
                    else int(training_row[EVENT_TARGET_COLUMN]),
                    training_row[RULE_LABEL_SOURCE_COLUMN] if training_row is not None and RULE_LABEL_SOURCE_COLUMN in training_row else "rule_derived",
                    training_row[EVENT_LABEL_SOURCE_COLUMN] if training_row is not None and EVENT_LABEL_SOURCE_COLUMN in training_row else None,
                    training_row[EVENT_LABEL_STRENGTH_COLUMN] if training_row is not None and EVENT_LABEL_STRENGTH_COLUMN in training_row else None,
                    int(training_row[EVENT_LABEL_AVAILABLE_COLUMN]) if training_row is not None and EVENT_LABEL_AVAILABLE_COLUMN in training_row else 0,
                ),
            )

            scored = scored_predictions.get(key)
            if scored:
                connection.execute(
                    """
                    INSERT INTO model_predictions VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        key,
                        area_id,
                        observed_at,
                        scored["modelName"],
                        scored["predictedLabel"],
                        scored["predictedProbability"],
                        scored["confidenceBand"],
                        scored["confidenceReason"],
                    ),
                )

            decision_audit = record.get("decisionAuditSnapshot") or {}
            connection.execute(
                """
                INSERT INTO decision_audits VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    key,
                    area_id,
                    observed_at,
                    decision_audit.get("evidenceConfidence"),
                    decision_audit.get("officialWarningContext"),
                    decision_audit.get("recommendationType"),
                    decision_audit.get("recommendationNote"),
                    json.dumps(decision_audit.get("hazardPressure")),
                    json.dumps(decision_audit.get("whatIncreasedConcern", [])),
                    json.dumps(decision_audit.get("whatReducedConcern", [])),
                    json.dumps(decision_audit.get("excludedEvidence", [])),
                    json.dumps(decision_audit.get("sourceLimitations", [])),
                    json.dumps(decision_audit.get("checkNext", [])),
                ),
            )

        connection.commit()
    return sqlite_path


def within_window(dataframe, area_id: str, start_time: str | None, end_time: str | None):
    """Filter replay rows to an area and optional interval."""

    area_rows = dataframe[dataframe["areaId"] == area_id].copy()
    if area_rows.empty:
        return area_rows

    import pandas as pd

    start_value = pd.Timestamp(start_time) if start_time is not None else None
    end_value = pd.Timestamp(end_time) if end_time is not None else None
    if start_time is not None:
        area_rows = area_rows[area_rows[GROUP_TIMESTAMP_COLUMN] >= start_value]
    if end_time is not None:
        area_rows = area_rows[area_rows[GROUP_TIMESTAMP_COLUMN] <= end_value]
    return area_rows


def summarise_window(
    area_rows,
    source_rows,
    scored_predictions: dict[str, dict[str, Any]],
    decision_audit_rows=None,
) -> dict[str, Any]:
    """Produce the compact replay comparison needed for calibration and review discussions."""

    if decision_audit_rows is None:
        import pandas as pd

        decision_audit_rows = pd.DataFrame()

    if area_rows.empty:
        return {
            "rowCount": 0,
            "ruleConcern": "unavailable",
            "warningStates": [],
            "agreementRate": None,
            "maxProbability": None,
            "degradedRows": 0,
            "latestObservedAt": None,
            "sourceModes": [],
            "evidenceConfidenceStates": [],
            "recommendationTypes": [],
        }

    prediction_rows = []
    for _, row in area_rows.iterrows():
        key = snapshot_key(row["areaId"], row[GROUP_TIMESTAMP_COLUMN].isoformat())
        prediction = scored_predictions.get(key)
        if prediction:
            prediction_rows.append(prediction)

    agreement_count = 0
    for _, row in area_rows.iterrows():
        key = snapshot_key(row["areaId"], row[GROUP_TIMESTAMP_COLUMN].isoformat())
        prediction = scored_predictions.get(key)
        if prediction is None:
            continue
        if int(row[RULE_TARGET_COLUMN]) == int(prediction["predictedLabel"]):
            agreement_count += 1

    degraded_rows = area_rows[
        (area_rows["sourceCoverage"].fillna(0) < 0.7)
        | (area_rows["dataFreshnessScore"].fillna(0) < 60)
    ]
    warning_values = (
        area_rows["warningStatus"].dropna().tolist()
        if "warningStatus" in area_rows.columns
        else []
    )
    warning_states = sorted({str(value) for value in warning_values if str(value).strip()})
    source_modes = sorted(
        {
            f"{row.get('source_type')}:{row.get('mode') or row.get('freshness_status') or 'unknown'}"
            for row in source_rows.to_dict("records")
        }
    )
    evidence_values = (
        decision_audit_rows["evidence_confidence"].dropna().tolist()
        if "evidence_confidence" in decision_audit_rows.columns
        else []
    )
    recommendation_values = (
        decision_audit_rows["recommendation_type"].dropna().tolist()
        if "recommendation_type" in decision_audit_rows.columns
        else []
    )
    evidence_confidence_states = sorted({str(value) for value in evidence_values if str(value).strip()})
    recommendation_types = sorted({str(value) for value in recommendation_values if str(value).strip()})
    return {
        "rowCount": int(len(area_rows)),
        "ruleConcern": best_rule_level(area_rows.to_dict("records")),
        "warningStates": warning_states,
        "agreementRate": None
        if not prediction_rows
        else round(agreement_count / len(prediction_rows), 3),
        "maxProbability": None
        if not prediction_rows
        else round(max(item["predictedProbability"] for item in prediction_rows), 4),
        "degradedRows": int(len(degraded_rows)),
        "latestObservedAt": area_rows[GROUP_TIMESTAMP_COLUMN].max().isoformat(),
        "sourceModes": source_modes,
        "evidenceConfidenceStates": evidence_confidence_states,
        "recommendationTypes": recommendation_types,
    }


def build_replay_report(dataset, sqlite_path: Path, scored_predictions: dict[str, dict[str, Any]]) -> str:
    """Turn replay data into a reviewer-friendly markdown summary."""

    windows = load_replay_windows(dataset)
    if sqlite_path.exists():
        with sqlite3.connect(sqlite_path) as connection:
            source_frame = None
            try:
                import pandas as pd

                source_frame = pd.read_sql_query("SELECT * FROM source_status", connection)
                audit_frame = pd.read_sql_query("SELECT * FROM decision_audits", connection)
            except Exception:
                source_frame = None
                audit_frame = None
    else:
        source_frame = None
        audit_frame = None

    lines = [
        "# FloodGuard Historical Replay",
        "",
        "FloodGuard replays committed history into SQLite so rule concern, warning state, source freshness, labels, and shadow ML outputs can be reviewed by area and time.",
        "",
        f"- SQLite path: `{sqlite_path}`",
        f"- Dataset rows replayed: `{len(dataset)}`",
        f"- Shadow model outputs available: `{'yes' if scored_predictions else 'no'}`",
        "- Note: current label backlog still contains placeholder non-event windows, so replay is stronger for plumbing and review than for event-level calibration claims.",
        "",
    ]

    for window in windows:
        area_id = window["area"]
        area_rows = within_window(dataset, area_id, window["start_time"], window["end_time"])
        if source_frame is not None:
            source_rows = source_frame[source_frame["area_id"] == area_id].copy()
            if window["start_time"] is not None:
                source_rows = source_rows[source_rows["observed_at"] >= window["start_time"]]
            if window["end_time"] is not None:
                source_rows = source_rows[source_rows["observed_at"] <= window["end_time"]]
        else:
            import pandas as pd

            source_rows = pd.DataFrame(columns=["source_type", "mode", "freshness_status"])
        if audit_frame is not None:
            audit_rows = audit_frame[audit_frame["area_id"] == area_id].copy()
            if window["start_time"] is not None:
                audit_rows = audit_rows[audit_rows["observed_at"] >= window["start_time"]]
            if window["end_time"] is not None:
                audit_rows = audit_rows[audit_rows["observed_at"] <= window["end_time"]]
        else:
            import pandas as pd

            audit_rows = pd.DataFrame(columns=["evidence_confidence", "recommendation_type"])
        summary = summarise_window(area_rows, source_rows, scored_predictions, audit_rows)
        lines.extend(
            [
                f"## {area_id}",
                "",
                f"- Window: `{window['start_time']}` to `{window['end_time']}`",
                f"- Label window: `{window['label']}` from `{window['label_source']}` with strength `{window['label_strength']}`",
                f"- Review status: `{window.get('review_status') or 'unknown'}`",
                f"- Evidence quality: `{event_evidence_quality(window)}`",
                f"- Rule concern peak: `{summary['ruleConcern']}` across `{summary['rowCount']}` snapshot(s)",
                f"- Warning states seen: `{', '.join(summary['warningStates']) if summary['warningStates'] else 'none recorded'}`",
                f"- Shadow ML max elevated probability: `{summary['maxProbability'] if summary['maxProbability'] is not None else 'unavailable'}`",
                f"- Shadow ML status: `{'available' if summary['maxProbability'] is not None else 'unavailable'}`",
                f"- Rule vs ML agreement: `{summary['agreementRate'] if summary['agreementRate'] is not None else 'unavailable'}`",
                f"- Degraded-source rows: `{summary['degradedRows']}`",
                f"- Evidence-confidence states: `{', '.join(summary['evidenceConfidenceStates']) if summary['evidenceConfidenceStates'] else 'none recorded'}`",
                f"- Recommendation types: `{', '.join(summary['recommendationTypes']) if summary['recommendationTypes'] else 'none recorded'}`",
                f"- Source modes/freshness: `{', '.join(summary['sourceModes']) if summary['sourceModes'] else 'legacy history only'}`",
                f"- Latest replayed snapshot: `{summary['latestObservedAt']}`",
                f"- Limitations: `{'; '.join(event_window_limitations(window)) if event_window_limitations(window) else 'none'}`",
                "",
            ]
        )
    return "\n".join(lines)


def build_replay_summary(dataset, sqlite_path: Path, scored_predictions: dict[str, dict[str, Any]]) -> dict[str, Any]:
    """Write a compact JSON summary so replay can be consumed outside markdown review."""

    windows = load_replay_windows(dataset)
    summaries: list[dict[str, Any]] = []
    if sqlite_path.exists():
        with sqlite3.connect(sqlite_path) as connection:
            import pandas as pd

            source_frame = pd.read_sql_query("SELECT * FROM source_status", connection)
            audit_frame = pd.read_sql_query("SELECT * FROM decision_audits", connection)
    else:
        import pandas as pd

        source_frame = pd.DataFrame(columns=["area_id", "observed_at", "source_type", "mode", "freshness_status"])
        audit_frame = pd.DataFrame(columns=["area_id", "observed_at", "evidence_confidence", "recommendation_type"])

    for window in windows:
        area_id = window["area"]
        area_rows = within_window(dataset, area_id, window["start_time"], window["end_time"])
        source_rows = source_frame[source_frame["area_id"] == area_id].copy()
        audit_rows = audit_frame[audit_frame["area_id"] == area_id].copy()
        if window["start_time"] is not None:
            source_rows = source_rows[source_rows["observed_at"] >= window["start_time"]]
            audit_rows = audit_rows[audit_rows["observed_at"] >= window["start_time"]]
        if window["end_time"] is not None:
            source_rows = source_rows[source_rows["observed_at"] <= window["end_time"]]
            audit_rows = audit_rows[audit_rows["observed_at"] <= window["end_time"]]
        summary = summarise_window(area_rows, source_rows, scored_predictions, audit_rows)
        summaries.append(
            {
                "areaId": area_id,
                "startTime": window["start_time"],
                "endTime": window["end_time"],
                "label": window["label"],
                "labelSource": window["label_source"],
                "labelStrength": window["label_strength"],
                "reviewStatus": window.get("review_status"),
                "evidenceLink": window.get("evidence_link"),
                "evidenceQuality": event_evidence_quality(window),
                "limitations": event_window_limitations(window),
                **summary,
            }
        )

    return {
        "available": True,
        "sqlitePath": str(sqlite_path),
        "rowCount": int(len(dataset)),
        "windowCount": len(summaries),
        "windows": summaries,
        "shadowPredictionCount": len(scored_predictions),
        "summary": "Historical replay is available for rule, warning, source-state, decision-audit, and shadow-ML comparison.",
    }


def run_replay(
    area_id: str | None = None,
    sqlite_path: Path = SQLITE_PATH,
    report_path: Path = REPORT_PATH,
    summary_json_path: Path = SUMMARY_JSON_PATH,
    event_report_path: Path = EVENT_REPORT_PATH,
) -> dict[str, Any]:
    """End-to-end historical replay entry point used by the CLI and tests."""

    ensure_runtime_dirs()
    if not DEFAULT_DATASET.exists():
        build_training_dataset()
    dataset = load_dataset(DEFAULT_DATASET)
    if area_id is not None:
        dataset = dataset[dataset["areaId"] == area_id].copy()

    history_records = load_jsonl_history(HISTORY_DIR, area_id)
    scored_predictions = score_shadow_predictions(dataset)
    sqlite_output = write_replay_sqlite(history_records, dataset, scored_predictions, sqlite_path)
    report = build_replay_report(dataset, sqlite_output, scored_predictions)
    summary = build_replay_summary(dataset, sqlite_output, scored_predictions)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(f"{report}\n", encoding="utf-8")
    event_report_path.parent.mkdir(parents=True, exist_ok=True)
    event_report_path.write_text(f"{report}\n", encoding="utf-8")
    summary_json_path.write_text(json.dumps(json_safe(summary), indent=2, allow_nan=False) + "\n", encoding="utf-8")
    return {
        "sqlitePath": str(sqlite_output),
        "reportPath": str(report_path),
        "eventReportPath": str(event_report_path),
        "summaryJsonPath": str(summary_json_path),
        "historyRowCount": len(history_records),
        "datasetRowCount": int(len(dataset)),
        "shadowPredictionCount": len(scored_predictions),
    }


def main() -> None:
    """Run replay with the standard project paths."""

    args = parse_args()
    result = run_replay(args.area_id, args.sqlite_path, args.report_path, event_report_path=args.event_report_path)
    print(f"Replayed {result['historyRowCount']} history snapshot(s).")
    print(f"SQLite: {result['sqlitePath']}")
    print(f"Report: {result['reportPath']}")
    print(f"Event report: {result['eventReportPath']}")


if __name__ == "__main__":
    main()
