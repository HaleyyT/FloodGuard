# FloodGuard Storage Upgrade Plan

FloodGuard currently stores latest signals and short historical snapshots in JSON and JSONL because that keeps local ingestion transparent and easy to inspect during rapid prototyping.

## Current state

- `floodguard-frontend/server/storage/latest-signals.json` keeps the newest dashboard payload.
- `floodguard-frontend/server/storage/history/*.jsonl` keeps append-only area snapshots.
- `floodguard-ml/data/floodguard_features.csv` and `floodguard-ml/data/floodguard_training_dataset.csv` turn those snapshots into ML-ready tabular exports.

## Why upgrade

JSONL is good for simple append-only history, but calibration and event review need stronger query paths:

- compare rule concern, warnings, labels, and ML outputs by area and time;
- inspect degraded-source periods without manually scanning files;
- replay labelled windows consistently during threshold review;
- prepare for more credible historical evaluation once independent labels improve.

## Near-term bridge

FloodGuard now adds a short-term replay database:

- path: `floodguard-data/floodguard_history.sqlite`
- builder: `python3.12 floodguard-ml/src/replay_events.py`
- purpose: load JSONL history plus the joined training dataset into queryable tables

Short-term SQLite tables:

- `readings`
- `source_status`
- `features`
- `risk_assessments`
- `warnings`
- `labels`
- `model_predictions`

This is intentionally a replay/calibration store, not a full production datastore.

## Query examples

Use SQLite to inspect evidence by area and time:

```sql
SELECT observed_at, rule_concern_level, risk_score
FROM risk_assessments
WHERE area_id = 'parramatta'
ORDER BY observed_at DESC
LIMIT 20;
```

```sql
SELECT observed_at, warning_status, warning_active
FROM warnings
WHERE area_id = 'toongabbie'
ORDER BY observed_at DESC;
```

```sql
SELECT observed_at, predicted_probability, confidence_band
FROM model_predictions
WHERE area_id = 'north-parramatta'
ORDER BY observed_at DESC;
```

FloodGuard's HTTP API now also exposes short-term event-window review directly from JSONL history without changing the dashboard contract:

- `GET /api/history?area=parramatta&sinceHours=72`
- `GET /api/history?area=parramatta&start=2026-06-29T00:00:00Z&end=2026-06-29T12:00:00Z&includeSummary=true`

The summary response is designed for replay, calibration review, and future expert inspection. It reports:

- the effective time filters used for the query;
- returned record count and oldest/newest timestamps;
- concern-level counts across the window;
- official-warning-context counts across the window;
- degraded-record count and rate;
- the latest visible risk level, score, and reliability snapshot.

## Medium-term target

Once ingestion coverage and labelled events improve, FloodGuard should move toward a stronger operational layout:

1. Keep JSONL as raw append-only capture for debugging.
2. Write canonical structured history to SQLite during ingestion.
3. Add indexed event-window and station-level tables.
4. Promote spatial tables to PostGIS if polygon warning relevance and catchment overlays become core features.

## Long-term path

The likely final architecture is:

1. Raw source capture and immutable snapshots.
2. Structured historical warehouse for replay and audit.
3. Spatially aware storage for warning polygons, gauge locations, and suburb/catchment mapping.
4. Versioned labels, threshold sets, and model outputs for expert review.

## Guardrails

- SQLite replay should never be presented as validated flood truth by itself.
- Model predictions stored here remain shadow-mode only.
- Placeholder or weak labels must stay clearly marked in `labels` and reports.
- Degraded or stale source periods must remain visible rather than being silently filtered out.
