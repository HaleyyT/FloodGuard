# FloodGuard (accepted for [Coding Fest](https://www.sydney.edu.au/engineering/industry-community/partner-with-us/coding-fest.html))


FloodGuard is a reliability-aware flood-awareness and decision-support prototype for the Parramatta pilot area set: Parramatta, North Parramatta, and Toongabbie. The system eliminates data fragmentation by translating rainfall, river, weather, warning-context, and public-signal evidence into an explainable local concern summary. Rather than leaving residents to compare multiple technical feeds manually, it empowers communities to react swiftly to emergent situations by clearly communicating what is happening, why it matters, and what next steps to take.

FloodGuard is not an official emergency-warning system. Official warnings are shown separately from FloodGuard-generated local concern, the live rule engine remains the active authority inside the prototype, and ML remains shadow mode only.

FloodGuard was accepted for showcase at Coding Fest 2026, a competition opened to all university students. FloodGuard's poster was selected for final judging and showcase presentation.

![FloodGuard dashboard prototype](docs/images/floodguard-6-july-final.png)


## Technical highlights

Its main technical contribution is the reliability layer. FloodGuard does not treat every source as equally trustworthy: it tracks freshness, provenance, fallback/cache state, official-warning separation, and degraded evidence before those signals are allowed to shape the visible concern summary or notification candidates.


| Area | What FloodGuard implements |
|---|---|
| Ingestion | Rainfall, river, weather, warning-context, and resident/public-signal ingestion |
| Reliability | Freshness checks, provenance, fallback/cache labelling, stale/missing/unavailable states |
| Risk logic | Explainable rule-based concern scoring with decision audit output |
| Notifications | Conservative suppression when degraded core evidence makes stronger advice unsafe |
| History | Queryable JSONL snapshots, replay summaries, decision-audit storage, and ML-ready feature export |
| ML | Python shadow pipeline, baseline models, scenario stress-test data, label audit, and model-card reporting |
| Testing | Backend regression tests, ingestion honesty checks, API contracts, replay coverage, and Playwright smoke flows |


## What is implemented

- Multi-area dashboard for Parramatta, North Parramatta, and Toongabbie
- Live or fallback ingestion paths for rainfall, river, and weather context
- Layered ingestion health with `coreFloodStatus`, `contextStatus`, `warningStatus`, and `overallStatus`
- Source provenance and freshness reporting
- Explainable rule-based risk scoring with decision audit output
- Public community-signal intake with validation, rate limiting, duplicate checks, and review-safe image-link handling
- Image-assisted evidence review queue for linked community-report media
- Historical snapshot storage and tabular feature export
- Replay summaries, compact `decisionSummary` outputs, and queryable review windows
- Notification decision logic with suppression and degraded-data safeguards
- Python ML prototype pipeline for offline training, evaluation, metrics, and model-card reporting
- Shadow-mode ML comparison surfaced in the backend and dashboard without overriding the live rule engine
- Scenario stress-test mode that demonstrates stronger synthetic flood pressure without pretending it is live
- Deterministic Playwright dashboard smoke tests plus replay and failure-injection regression coverage

## Why this project is technically interesting

FloodGuard is not just a visual flood dashboard. It is a reliability-aware decision layer that checks whether evidence is live, stale, cached, fallback-based, missing, or unavailable before allowing it to influence user-facing concern levels or notification decisions.

That matters because high-stakes software should not only produce a status label; it should also make the quality, limits, and trustworthiness of its evidence visible before people act on it.

## Project structure

- [floodguard-frontend](./floodguard-frontend/README.md): React dashboard and Node ingestion/API layer
- [floodguard-ml](./floodguard-ml/README.md): Python ML experimentation workspace
- [docs](./docs): public screenshots and diagram assets used to present FloodGuard
- [explanation.md](./explanation.md): beginner-friendly guide to FloodGuard's framework, logic, reliability model, and ML boundaries

## How FloodGuard works

1. Public source adapters fetch rainfall, river, weather, and warning context when available.
2. Source metadata records freshness, mode, strength, and fallback/degraded state.
3. Area mapping and lightweight spatial relevance select the best local context for each pilot suburb.
4. The rule engine combines rainfall, river, wetness, confidence, and public-signal pressure into an explainable concern score.
5. The dashboard presents current concern, trust state, why the concern was assigned, and recommended next steps.
6. Historical snapshots are exported into feature rows for offline Python ML experiments.
7. A scenario stress-test mode can demonstrate stronger synthetic flood pressure without confusing it with the live area state.
8. ML results are shown in shadow mode only and do not control live alerts.

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
- thresholds remain prototype-calibration pending and still need reviewed event evidence plus domain review
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

## Verification

FloodGuard includes checks for:

- backend ingestion behaviour and source-health contracts
- stale/cache/fallback honesty under degraded-source conditions
- frontend production build correctness
- dashboard smoke testing across core views and area switching
- ML report and API contract stability
- replay summary and event-window review contract stability
- strict live-source readiness when genuinely current data is available

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

### Quick start for judges and reviewers

```bash
cd floodguard-frontend
npm install
npm run demo
```

Then open `http://127.0.0.1:4173/`.

`npm run demo` is the easiest end-to-end command for manual review because it refreshes one ingestion snapshot, starts the Node API, and starts the frontend with the correct local API wiring. The commands below remain available if you want to run components manually.

### Start the dashboard manually

```bash
cd floodguard-frontend
npm install
npm run dev
```

### Start the API manually

```bash
cd floodguard-frontend
npm run api
```

### Camera-ready verification

```bash
cd floodguard-frontend
npm run test
npm run build
npm run check:ingestion
```

For the current prototype, `npm run check:ingestion` is the camera-ready honesty gate. It passes when degraded, stale, cached, unavailable, or partially connected sources are labelled safely rather than misrepresented as live. `npm run check:ingestion:live` is stricter and should only pass when rainfall, river, and supporting live context are genuinely current.

### Refresh ingestion manually

```bash
cd floodguard-frontend
npm run ingest
```

### Collect source snapshots for evidence/history review

```bash
cd floodguard-frontend
npm run collect:sources
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

## Demo walkthrough

1. Select a pilot area.
2. Inspect the current concern level and key concern drivers.
3. Check source-health and evidence reliability to see whether the signals are live, stale, cached, fallback, or unavailable.
4. Review the decision audit and rainfall/river context to understand why the concern level was assigned.
5. Inspect notifications and public signals to see how FloodGuard behaves under stronger or degraded evidence.
6. Review the ML shadow output, noting that it is comparison-only and does not control live alerts.

## Key API routes

- `GET /api/health`
- `GET /api/areas`
- `GET /api/signals?area=parramatta`
- `GET /api/source-registry?area=parramatta`
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

FloodGuard's internal submission-writing notes, poster drafts, verification logs, and planning documents are kept as private working material and are not part of the public repo surface.

The public repo keeps the implementation, screenshots, diagrams, roadmap, and beginner-facing explanation that are most useful for reviewers, judges, and future collaborators.

## Ingestion-readiness note

FloodGuard now separates:

- submission readiness, where degraded external sources are acceptable if they are labelled honestly
- strict live-source readiness, where rainfall and river must be genuinely fresh live readings

This is why a stale-source run can still demonstrate a successful trust layer even when strict live operation is not currently available.

## References

- Breiman, L. (2001). Random forests. *Machine Learning, 45*(1), 5-32. https://doi.org/10.1023/A:1010933404324
- Bureau of Meteorology. (n.d.). *New South Wales rain and river data*. Retrieved July 7, 2026, from https://www.bom.gov.au/nsw/flood/rain_river.shtml
- City of Parramatta. (n.d.). *Check your river and rain gauge levels*. Retrieved July 7, 2026, from https://www.cityofparramatta.nsw.gov.au/environment/flooding-and-emergencies/floodsmart-parramatta/check-your-river-and-rain-gauge-levels
- City of Parramatta FloodSmart. (n.d.). *Lizard measuring stations API* [Data set]. Retrieved July 7, 2026, from https://parramatta.lizard.net/api/v4/measuringstations/
- Cox, D. R. (1958). The regression analysis of binary sequences. *Journal of the Royal Statistical Society: Series B (Methodological), 20*(2), 215-242.
- Data.NSW. (n.d.). *Hazard Watch* [Data set]. Retrieved July 7, 2026, from https://data.nsw.gov.au/data/dataset/hazard-watch
- Geurts, P., Ernst, D., & Wehenkel, L. (2006). Extremely randomized trees. *Machine Learning, 63*(1), 3-42. https://doi.org/10.1007/s10994-006-6226-1
- HazardWatch. (n.d.). *HazardWatch*. Retrieved July 7, 2026, from https://www.hazardwatch.gov.au/
- NSW Flood Data Portal. (n.d.). *NSW Flood Data Portal*. Retrieved July 7, 2026, from https://flooddata.ses.nsw.gov.au/
- NSW State Emergency Service. (n.d.). *Understand warning levels*. Retrieved July 7, 2026, from https://www.ses.nsw.gov.au/understand-warnings
