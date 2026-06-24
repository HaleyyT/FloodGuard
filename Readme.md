# FloodGuard

FloodGuard is a flood-awareness prototype focused on **GWS** related suburbs - **Parramatta, North Parramatta and Toongabbie**. It combines **local weather observations, rainfall gauge data, and river-context signals** into a single explainable dashboard to help users understand changing local flood conditions. 

## Prototype Preview

![FloodGuard dashboard prototype](docs/images/db-12-6.png)


## Why FloodGuard

Flood-related information is often scattered across multiple public sources. FloodGuard brings key local signals into one place so residents and planners can more easily see:

- what is happening locally
- which signals are contributing to risk
- what actions may matter next

## Community Reports

FloodGuard now includes a small resident-report intake path. The dashboard can save area-specific community observations, and the backend stores them locally as unverified signals so they can later support validation, moderation, and image-assisted evidence.

Report intake includes JSON validation, request size limits, duplicate detection, basic rate limiting, and a quality score so community input is useful without being treated as automatically verified.

Recent validated reports are also summarised into a bounded public-signal pressure score. This score is attached to each area as supplementary evidence for dashboard explanations, decision audit context, and ML-ready feature rows without overriding official rainfall, river, or weather risk signals.

The first image-assisted validation step is metadata-only for safety. Residents can attach a secure HTTPS image link to a report, but FloodGuard stores it as unreviewed supplementary evidence instead of uploading or automatically trusting the file. Linked evidence is placed into a review queue with priority scoring, and localhost/private-network image hosts are rejected.

## Current MVP

The current prototype includes:

- Parramatta-focused dashboard
- weather observation integration
- nearby rainfall trend visualisation
- river-context integration
- automatic backend ingestion pipeline
- unified Parramatta signals API
- config-based regional pilot for Parramatta, North Parramatta, and Toongabbie
- explainable signal summary
- evidence and action-oriented dashboard panels

## Tech Stack

- React
- Vite
- Recharts
- Node.js backend using native HTTP
- Normalised public weather, rainfall, and river data
- Area-specific station relevance mapping

## Data Approach

FloodGuard uses a **real-data-informed prototype pipeline**:

1. Public source files or configured API URLs are fetched by the backend
2. Raw weather, rainfall, and river data is normalised into a consistent internal format
3. Area relevance rules select the weather, rainfall, and river stations that matter for each pilot suburb
4. The backend stores the latest processed regional signal snapshot
5. API routes serve clean JSON to the dashboard
6. The frontend reads from the API first, then falls back to local JSON if the backend is not running

This makes the prototype easier to explain, maintain, and extend.

## Risk Logic

FloodGuard now uses a more explainable rule-based risk engine. The backend computes:

- rainfall pressure
- river pressure
- wetness pressure
- source confidence
- rainfall windows for the latest 24h and 72h

These features are combined into a 0-100 risk score and a Low / Moderate / High concern level.

## Historical Storage

Each ingestion run now stores compact area-level history records. These records preserve:

- risk level and score
- rainfall features
- river station summary
- source freshness and confidence

This gives FloodGuard the memory needed for future baselines, rolling comparisons, and ML-ready feature datasets.

## ML-Ready Features

FloodGuard can now convert stored history into tabular feature rows. These rows include:

- rainfall features
- river tendency features
- wetness and pressure scores
- supplementary public-signal pressure from recent community reports
- image-evidence counts from unreviewed community report links
- image review queue priority counts
- source confidence
- lagged risk score change
- target label for elevated local concern

This prepares the project for a future baseline classifier without pretending that the current small history is enough for a real model yet.

## Baseline Prediction

FloodGuard now includes a transparent feature baseline that scores the latest stored feature row and compares it with the rule-engine label. It is deliberately simple and inspectable, so it acts as a bridge between rule-based decisions and future trained ML models.

FloodGuard also exposes dataset-quality diagnostics and a baseline model card. These explain whether the feature table is ready for model comparison, which gates are still collecting data, what the baseline is trying to predict, and why it should not be treated as a final trained model yet.

## Regional Pilot

FloodGuard is now multi-area ready without jumping straight to PostGIS. The current pilot uses a simple config mapping to connect each area to relevant public stations:

- Parramatta
- North Parramatta
- Toongabbie

This is the practical middle step between a single-location prototype and a broader Western Sydney system. It keeps the logic explainable while making the backend reusable for more suburbs and catchments later.

## Location-Aware Relevance

The backend now scores how well the current weather, rainfall, and river feeds match the selected area configuration. Each area response includes:

- matched versus expected station signals
- source-level fit for weather, rainfall, and river stations
- missing configured river or creek stations
- an area relevance score shown on the dashboard
- coordinate-based station distances and coverage radius

This gives FloodGuard a clear pre-PostGIS relevance layer: the dashboard can explain why a signal belongs to Parramatta, North Parramatta, or Toongabbie before moving to automatic spatial joins later.

`GET /api/spatial-relevance?area=parramatta` returns the lightweight spatial relevance view for an area. `GET /api/spatial-relevance?lat=-33.8&lon=151` resolves the nearest pilot area and ranks nearby signal stations.

## Source Freshness

FloodGuard now checks the source observation date, not only the time the backend fetched the file. This matters when a fallback feed is available but old. Stale sources are:

- counted in the API freshness summary
- shown on the dashboard
- stored in history and feature rows
- used to reduce risk confidence

## Decision Audit

FloodGuard now returns a decision audit with the weighted risk-score components and a reliability rating. This makes the rule engine easier to inspect because the dashboard can show:

- rainfall, river, wetness, and weather score contributions
- Low / Medium / High reliability
- stale, fallback, missing, or failed source warnings
- the thresholds used for Low, Moderate, and High concern

## Run Locally

### Requirements
- Node.js 20.19+ or 22.12+
- npm

### Start the app
```bash
git clone https://github.com/HaleyyT/FloodGuard.git
cd FloodGuard/floodguard-frontend
npm install
npm run dev
```

### Start the ingestion API
```bash
cd FloodGuard/floodguard-frontend
npm run ingest
npm run api
```

The API runs at `http://127.0.0.1:5174` by default.

Useful routes:

- `GET /api/health`
- `GET /api/areas`
- `GET /api/community-reports?area=parramatta`
- `POST /api/community-reports`
- `GET /api/evidence-review?area=parramatta`
- `GET /api/signals?area=parramatta`
- `GET /api/signals?area=north-parramatta`
- `GET /api/signals?area=toongabbie`
- `GET /api/signals?area=toongabbie&refresh=true`
- `GET /api/history?area=parramatta`
- `GET /api/features?area=parramatta`
- `GET /api/features?area=parramatta&format=csv`
- `GET /api/dataset-quality?area=parramatta`
- `GET /api/baseline-prediction?area=parramatta`
- `GET /api/model-card?area=parramatta`
- `GET /api/source-health?area=parramatta`
- `GET /api/decision-audit?area=parramatta`
- `GET /api/spatial-relevance?area=parramatta`
- `GET /api/spatial-relevance?lat=-33.8&lon=151`
- `GET /api/signals/parramatta`
- `GET /api/rainfall/parramatta`
- `GET /api/river/parramatta`
- `GET /api/risk/parramatta`

Optional remote source environment variables:

- `FLOODGUARD_WEATHER_URL`
- `FLOODGUARD_RAINFALL_URL`
- `FLOODGUARD_RIVER_URL`
- `VITE_FLOODGUARD_API_URL`
- `VITE_FLOODGUARD_AREAS_API_URL`
- `VITE_FLOODGUARD_BASELINE_API_URL`
- `VITE_FLOODGUARD_COMMUNITY_REPORTS_API_URL`
- `VITE_FLOODGUARD_REFRESH_MS`

The dashboard refreshes the selected area automatically. Set `VITE_FLOODGUARD_REFRESH_MS` to control the polling interval; the default is 60 seconds.

By default, FloodGuard now fetches live BoM Parramatta weather observations directly from BoM JSON and derives the rainfall graph from BoM rain-trace observations when no WaterNSW rainfall API URL is configured. `FLOODGUARD_RAINFALL_URL` and `FLOODGUARD_RIVER_URL` are still needed for fully live gauge rainfall and river-height feeds.
