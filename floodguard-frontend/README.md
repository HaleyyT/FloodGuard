# FloodGuard Frontend + API

This package contains the FloodGuard React dashboard and the Node.js ingestion/API layer used by the prototype.

## What runs here

- React + Vite dashboard
- Node HTTP API
- Multi-area signal ingestion for Parramatta, North Parramatta, and Toongabbie
- Rule-based concern scoring and decision audit output
- Community-report intake and review-safe evidence queue
- Dashboard-facing endpoints for history, features, notifications, and ML shadow reporting

## Local setup

```bash
npm install
```

Start the dashboard:

```bash
npm run dev
```

Start the API:

```bash
npm run api
```

Refresh the stored ingestion snapshot manually:

```bash
npm run ingest
```

Run the ingestion honesty check:

```bash
npm run check:ingestion
```

Run the strict live-source check:

```bash
npm run check:ingestion:live
```

## Data flow

```text
Fetchers -> Normalisers -> Source trust -> Risk engine -> API -> Dashboard
```

## Core platform behavior

The backend prefers configured remote sources when they are available. If a live fetch fails, FloodGuard can keep the latest good cache or fall back to demo data, but it labels that state clearly instead of silently claiming everything is live.

Community observations are accepted through `POST /api/community-reports` and stored as local unverified signals. The dashboard reads them back through `GET /api/community-reports?area=parramatta`.

Image-assisted validation is metadata-only for now. Residents may attach a secure HTTPS image URL and short note, but FloodGuard stores the link as unreviewed supplementary evidence rather than accepting raw uploads.

Recent validated reports contribute to a bounded public-signal pressure score. This appears as supplementary evidence in the risk engine, decision audit, history, feature export, and dashboard summaries.

## Reliability and trust

FloodGuard surfaces reliability explicitly:

- layered ingestion health through `coreFloodStatus`, `contextStatus`, `warningStatus`, and `overallStatus`
- source mode such as live, recent cache, stale cache, demo fallback, or not connected
- freshness checks using source observation times
- area-fit and lightweight spatial relevance before a future PostGIS layer

This is one of the key design goals of the prototype.

`npm run check:ingestion` now represents submission readiness rather than strict live availability. It passes when FloodGuard handles stale, cached, fallback, or unavailable external sources honestly without crashing or mislabelling them as live.

`npm run check:ingestion:live` is stricter. It only passes when rainfall and river readings are genuinely fresh live readings.

## Risk engine

The backend computes:

- rainfall pressure
- river pressure
- wetness pressure
- public-signal pressure
- confidence / reliability adjustments
- recent rainfall windows
- decision audit details

These are combined into an explainable concern score and concern level without hiding degraded-source caveats.

## Historical storage and features

Each refreshed ingestion appends compact area snapshots under `server/storage/history`. These files are git-ignored and serve as prototype storage for:

- dashboard history
- exported feature rows
- baseline comparisons
- Python ML experiments

`GET /api/features?area=parramatta` exports feature rows with rainfall, river, wetness, freshness, coverage, public-signal, and lagged-score fields. Use `format=csv` to inspect them directly.

## ML integration

The dashboard consumes several backend endpoints that prepare or surface ML shadow-mode information:

- `GET /api/dataset-quality?area=parramatta`
- `GET /api/baseline-prediction?area=parramatta`
- `GET /api/model-experiment?area=parramatta`
- `GET /api/model-card?area=parramatta`
- `GET /api/ml/report`

Important:

- the rule engine remains the live decision authority
- ML is shadow mode only
- current labels are rule-derived
- the current real export is not strong enough for validated predictive claims

## Environment variables

- `FLOODGUARD_WEATHER_URL`
- `FLOODGUARD_RAINFALL_URL`
- `FLOODGUARD_RIVER_URL`
- `FLOODGUARD_API_HOST`
- `FLOODGUARD_API_PORT`
- `VITE_FLOODGUARD_API_URL`
- `VITE_FLOODGUARD_AREAS_API_URL`
- `VITE_FLOODGUARD_HISTORY_API_URL`
- `VITE_FLOODGUARD_FEATURES_API_URL`
- `VITE_FLOODGUARD_DATASET_QUALITY_API_URL`
- `VITE_FLOODGUARD_BASELINE_API_URL`
- `VITE_FLOODGUARD_MODEL_EXPERIMENT_API_URL`
- `VITE_FLOODGUARD_MODEL_CARD_API_URL`
- `VITE_FLOODGUARD_ML_REPORT_API_URL`
- `VITE_FLOODGUARD_COMMUNITY_REPORTS_API_URL`
- `VITE_FLOODGUARD_EVIDENCE_REVIEW_API_URL`
- `VITE_FLOODGUARD_NOTIFICATIONS_API_URL`
- `VITE_FLOODGUARD_REFRESH_MS`

`VITE_FLOODGUARD_REFRESH_MS` controls dashboard polling and defaults to 60 seconds.

## Key API routes

- `GET /api/health`
- `GET /api/areas`
- `GET /api/signals?area=parramatta`
- `GET /api/signals?area=north-parramatta`
- `GET /api/signals?area=toongabbie`
- `GET /api/signals?area=toongabbie&refresh=true`
- `GET /api/history?area=parramatta`
- `GET /api/community-reports?area=parramatta`
- `POST /api/community-reports`
- `GET /api/evidence-review?area=parramatta`
- `GET /api/features?area=parramatta`
- `GET /api/features?area=parramatta&format=csv`
- `GET /api/dataset-quality?area=parramatta`
- `GET /api/baseline-prediction?area=parramatta`
- `GET /api/model-experiment?area=parramatta`
- `GET /api/model-card?area=parramatta`
- `GET /api/ml/report`
- `GET /api/notifications?area=parramatta`
- `GET /api/notifications/preview?area=parramatta`
- `GET /api/source-health?area=parramatta`
- `GET /api/ingestion-readiness`
- `GET /api/decision-audit?area=parramatta`
- `GET /api/spatial-relevance?area=parramatta`
- `GET /api/spatial-relevance?lat=-33.8&lon=151`

## Verification commands

- `npm run lint`
- `npm run test`
- `npm run build`
- `npm run check:ingestion`
