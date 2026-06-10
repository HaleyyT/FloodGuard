# FloodGuard Frontend

This folder contains the FloodGuard React dashboard and the first backend milestone for automatic Parramatta data ingestion.

## What Runs Here

- React + Vite dashboard
- Recharts rainfall and risk visualisations
- Node.js ingestion backend
- Multi-area API routes for weather, rainfall, river, and risk signals
- Area selector for Parramatta, North Parramatta, and Toongabbie

## Local Setup

```bash
npm install
```

Start the frontend:

```bash
npm run dev
```

Start the backend API:

```bash
npm run api
```

Refresh the stored regional signal snapshot manually:

```bash
npm run ingest
```

## Data Flow

```text
Fetcher -> Normaliser -> Store -> Risk Engine -> API -> Frontend
```

The backend reads configured remote JSON URLs when environment variables are present. If a URL is not configured or fetch fails, it uses the checked-in local raw JSON files so the demo remains stable.

After normalising the shared public feeds, the backend applies area-specific station mapping from `server/ingestion/areaConfig.js`. This keeps the first regional pilot explainable before adding heavier spatial tooling such as PostGIS.

The weather source has a live BoM default URL. If `FLOODGUARD_RAINFALL_URL` is not configured, the rainfall graph uses live BoM rain-trace observations instead of the older local rainfall file. River context still uses local fallback data until `FLOODGUARD_RIVER_URL` is connected to a live source.

## Risk Engine

The backend risk engine computes rainfall pressure, river pressure, wetness pressure, and source confidence. It also tracks rainfall in the latest 24h and 72h windows so the dashboard can explain why an area is Low, Moderate, or High risk.

## Historical Storage

Every refreshed ingestion appends compact area snapshots under `server/storage/history`. The files are ignored by git, but the API can read them back so the dashboard can show recent signal memory for the selected area.

## ML-Ready Features

`GET /api/features?area=parramatta` transforms stored history into tabular rows with rainfall, river, wetness, confidence, lagged score, and elevated-concern target fields. Use `format=csv` to inspect or export the feature table.

Environment variables:

- `FLOODGUARD_WEATHER_URL`
- `FLOODGUARD_RAINFALL_URL`
- `FLOODGUARD_RIVER_URL`
- `FLOODGUARD_API_HOST`
- `FLOODGUARD_API_PORT`
- `VITE_FLOODGUARD_API_URL`
- `VITE_FLOODGUARD_AREAS_API_URL`
- `VITE_FLOODGUARD_REFRESH_MS`

`VITE_FLOODGUARD_REFRESH_MS` controls how often the dashboard refreshes the selected area. It defaults to 60 seconds.

## API Routes

- `GET /api/health`
- `GET /api/areas`
- `GET /api/signals?area=parramatta`
- `GET /api/signals?area=north-parramatta`
- `GET /api/signals?area=toongabbie`
- `GET /api/signals?area=toongabbie&refresh=true`
- `GET /api/history?area=parramatta`
- `GET /api/features?area=parramatta`
- `GET /api/features?area=parramatta&format=csv`
- `GET /api/signals/parramatta`
- `GET /api/rainfall/parramatta`
- `GET /api/river/parramatta`
- `GET /api/risk/parramatta`

The dashboard tries the area-aware API first, then falls back to the local static Parramatta signals if the API is unavailable.
