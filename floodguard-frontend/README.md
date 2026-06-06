# FloodGuard Frontend

This folder contains the FloodGuard React dashboard and the first backend milestone for automatic Parramatta data ingestion.

## What Runs Here

- React + Vite dashboard
- Recharts rainfall and risk visualisations
- Node.js ingestion backend
- Parramatta API routes for weather, rainfall, river, and risk signals

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

Refresh the stored signal snapshot manually:

```bash
npm run ingest
```

## Data Flow

```text
Fetcher -> Normaliser -> Store -> Risk Engine -> API -> Frontend
```

The backend reads configured remote JSON URLs when environment variables are present. If a URL is not configured or fetch fails, it uses the checked-in local raw JSON files so the demo remains stable.

Environment variables:

- `FLOODGUARD_WEATHER_URL`
- `FLOODGUARD_RAINFALL_URL`
- `FLOODGUARD_RIVER_URL`
- `FLOODGUARD_API_HOST`
- `FLOODGUARD_API_PORT`
- `VITE_FLOODGUARD_API_URL`

## API Routes

- `GET /api/health`
- `GET /api/signals/parramatta`
- `GET /api/rainfall/parramatta`
- `GET /api/river/parramatta`
- `GET /api/risk/parramatta`

The dashboard tries `VITE_FLOODGUARD_API_URL` first, then falls back to the local static signals if the API is unavailable.
