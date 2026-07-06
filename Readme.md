# FloodGuard (accepted for [Coding Fest](https://www.sydney.edu.au/engineering/industry-community/partner-with-us/coding-fest.html))


FloodGuard is a reliability-aware flood-awareness and decision-support prototype for the Parramatta pilot area set: Parramatta, North Parramatta, and Toongabbie. It combines local rainfall, river, weather, public-signal, and source-trust evidence into an explainable local concern level. The live dashboard is intentionally honest about stale sources, fallback state, and official-warning feeds that may be connected but still too old for a live claim.

FloodGuard was accepted for showcase at Coding Fest 2026, a competition opened to all university students. FloodGuard's poster was selected for final judging and showcase presentation.

![FloodGuard dashboard prototype](docs/images/floodguard-6-july-final.png)


## What is implemented

- Multi-area dashboard for Parramatta, North Parramatta, and Toongabbie
- Live or fallback ingestion paths for rainfall, river, and weather context
- Layered ingestion health with `coreFloodStatus`, `contextStatus`, `warningStatus`, and `overallStatus`
- Source provenance and freshness reporting
- Explainable rule-based risk scoring with decision audit output
- Public community-signal intake with validation, rate limiting, duplicate checks, and review-safe image-link handling
- Historical snapshot storage and tabular feature export
- Notification decision logic with suppression and degraded-data safeguards
- Python ML prototype pipeline for offline training, evaluation, metrics, and model-card reporting
- Shadow-mode ML comparison surfaced in the backend and dashboard without overriding the live rule engine
- Deterministic Playwright dashboard smoke tests plus replay and failure-injection regression coverage

## Project structure

- [floodguard-frontend](./floodguard-frontend/README.md): React dashboard and Node ingestion/API layer
- [floodguard-ml](./floodguard-ml/README.md): Python ML experimentation workspace
- [docs](./docs): submission notes, abstract/poster copy, and screenshots
- [roadmap](./roadmap): implementation plans and progress tracking
- [explanation.md](./explanation.md): beginner-friendly guide to FloodGuard's framework, logic, reliability model, and ML boundaries

## How FloodGuard works

1. Public source adapters fetch rainfall, river, weather, and warning context when available.
2. Source metadata records freshness, mode, strength, and fallback/degraded state.
3. Area mapping and lightweight spatial relevance select the best local context for each pilot suburb.
4. The rule engine combines rainfall, river, wetness, confidence, and public-signal pressure into an explainable concern score.
5. The dashboard presents current concern, trust state, why the concern was assigned, and recommended next steps.
6. Historical snapshots are exported into feature rows for offline Python ML experiments.
7. ML results are shown in shadow mode only and do not control live alerts.

## Why the reliability layer matters

FloodGuard is designed to avoid a common prototype failure mode: looking “live” even when sources are stale, missing, or fallback-only.

The app checks:

- whether rainfall and river gauges are current enough for a live claim
- whether supporting context is stale or partial
- whether official warnings are live, stale, unavailable, or still missing
- whether recent cache is being reused because a live refresh failed

This means the dashboard can say “blocked”, “partial”, or “fallback” instead of silently pretending the data is current.

## ML status

FloodGuard includes a Python-based prototype ML pipeline that:

- loads exported FloodGuard feature rows
- runs baseline models such as majority baseline, logistic regression, and random forest
- produces metrics and model-card reporting
- compares ML outputs against rule-derived labels in shadow mode

Current ML limitations:

- current historical labels are rule-derived rather than independent flood outcomes
- the real export is severely imbalanced
- there are no real `High` examples in the current dataset
- ML is implemented for plumbing, safeguards, and comparison, not validated operational prediction

## Safety and domain expert oversight

FloodGuard does not replace NSW SES, Bureau of Meteorology, council, or emergency-service advice. The project currently provides local flood-awareness support by combining public signals with reliability checks and explainable risk logic.

Because flood-risk guidance is high stakes, future versions require expert review of:

- rainfall thresholds and river-signal calibration
- next-step wording and notification safety
- when degraded evidence should suppress stronger guidance
- ML labels, validation strategy, and operational boundaries

FloodGuard therefore keeps:

- official warnings separate from FloodGuard-generated concern
- stale and cached data labelled explicitly
- strong app-generated alerts suppressed when core evidence is degraded
- ML in shadow mode rather than operational use

## Limitations

- Official NSW SES / HazardWatch integration is now connected through a default public HazardWatch adapter, but it is not yet mature enough to count as a stable live operational warning feed in every run.
- Core live-gauge ingestion can degrade to stale cache or fallback depending on source availability.
- Historical storage is currently JSONL-based prototype storage, not production-grade event storage.
- Risk thresholds are heuristic and not yet calibrated against validated flood outcomes.
- The ML layer remains shadow mode until stronger labels and broader validation exist.
- Future deployment requires hydrologist, council, and emergency-management review before any operational safety use.

## Run locally

### Requirements

- Node.js 20.19+ or 22.12+
- npm
- Python 3.11+ for the `floodguard-ml` workspace

### Start the dashboard

```bash
cd floodguard-frontend
npm install
npm run dev
```

### Start the API

```bash
cd floodguard-frontend
npm run api
```

### Refresh ingestion manually

```bash
cd floodguard-frontend
npm run ingest
```

### Check ingestion honesty state

```bash
cd floodguard-frontend
npm run check:ingestion
```

### Run backend tests

```bash
cd floodguard-frontend
npm run test
```

### Run end-to-end smoke tests

```bash
cd floodguard-frontend
npm run test:e2e
```

### Build production frontend

```bash
cd floodguard-frontend
npm run build
```

### Run the Python ML pipeline

See [floodguard-ml/README.md](./floodguard-ml/README.md).

## Key API routes

- `GET /api/health`
- `GET /api/areas`
- `GET /api/signals?area=parramatta`
- `GET /api/source-health?area=parramatta`
- `GET /api/ingestion-readiness`
- `GET /api/decision-audit?area=parramatta`
- `GET /api/community-reports?area=parramatta`
- `POST /api/community-reports`
- `GET /api/evidence-review?area=parramatta`
- `GET /api/history?area=parramatta`
- `GET /api/features?area=parramatta`
- `GET /api/dataset-quality?area=parramatta`
- `GET /api/baseline-prediction?area=parramatta`
- `GET /api/model-experiment?area=parramatta`
- `GET /api/model-card?area=parramatta`
- `GET /api/ml/report`
- `GET /api/notifications?area=parramatta`
- `GET /api/spatial-relevance?area=parramatta`

## Submission notes

- [docs/submission-readiness.md](./docs/submission-readiness.md): verification status and claim boundaries
- [docs/final-verification.md](./docs/final-verification.md): final command results, manual demo checks, and known caveats
- [docs/abstract.md](./docs/abstract.md): abstract-ready wording
- [docs/poster-copy.md](./docs/poster-copy.md): poster text blocks
- [docs/demo-script.md](./docs/demo-script.md): short demo flow
- [docs/ml-scope.md](./docs/ml-scope.md): honest ML wording and scope guardrails
- [docs/expert-review-plan.md](./docs/expert-review-plan.md): domain-review pathway for thresholds, wording, and future validation

## Ingestion-readiness note

FloodGuard now separates:

- submission readiness, where degraded external sources are acceptable if they are labelled honestly
- strict live-source readiness, where rainfall and river must be genuinely fresh live readings

This is why a stale-source run can still demonstrate a successful trust layer even when strict live operation is not currently available.

## Honest one-line summary

FloodGuard is a reliability-aware flood-awareness prototype that turns local public signals into explainable local concern levels, while clearly showing when those signals are current, partial, stale, or only available through fallback data.
