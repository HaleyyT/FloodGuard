# FloodGuard Submission Readiness

_Updated: 2026-07-01_

## Day 5 objective

This note records the current camera-ready state of FloodGuard after the Day 5 submission-polish pass.

## Verification checks run

All commands below were run from [floodguard-frontend/package.json](/Users/haleytran/Desktop/Projects/FloodGuard/floodguard-frontend/package.json:1) on July 1, 2026.

| Command | Result | Notes |
|---|---|---|
| `npm run lint` | pass | ESLint completed with no reported errors. |
| `npm run test` | pass | `50/50` backend and contract tests passed. |
| `npm run build` | pass with warning | Production build succeeds; Vite reports a large main-chunk warning. |
| `npm run check:ingestion` | pass with degraded external source | Submission readiness now passes when stale/cached external sources are labelled honestly and no live claim is made. |
| `npm run check:ingestion:live` | fail | Strict live readiness still fails because current rainfall and river readings are not fresh live readings. |

## What is now submission-ready

- Overview dashboard is cleaner and screenshot-oriented, with concern summary, rainfall, river, public signals, map context, source evidence, official-warning separation, and ML shadow summary visible without leaving the main flow.
- README and package-level documentation now describe the system honestly and consistently.
- Poster text, abstract text, and demo-script wording now exist in `docs/`.
- ML integration is visible and clearly labelled as shadow mode rather than live decision authority.
- Backend verification remains strong, with passing tests and a successful production build.

## Current ingestion reality

`npm run check:ingestion:live` currently reports:

- overall ingestion health: `blocked`
- core flood gauges: `blocked`
- supporting context: `warn`
- official warnings: `missing`

Observed reasons in the latest run:

- FloodSmart rainfall gauge ingestion failed and only `cached_stale` rainfall data was available.
- FloodSmart river gauge ingestion failed and only `cached_stale` river data was available.
- Parramatta weather context was also stale in the checked run.
- NSW SES / HazardWatch official-warning integration is still `not-configured`.

What this means:

- the honesty and degraded-source logic are working correctly;
- the current run is acceptable for submission readiness because degraded-state handling is explicit;
- the current run is not healthy enough to claim fully live flood-gauge operation;
- submission/demo wording must continue to describe live ingestion as architecture with degraded-state handling, not guaranteed current operation.

## Safe public claims

Allowed claims:

- FloodGuard has a real ingestion architecture for rainfall, river, weather, source trust, and dashboard delivery.
- FloodGuard explicitly checks freshness, fallback state, and provenance before presenting data as live.
- FloodGuard includes explainable rule-based concern scoring, decision audit output, and notification decision logic.
- FloodGuard stores historical snapshots, exports feature rows, and includes a Python ML prototype pipeline in shadow mode.
- FloodGuard surfaces ML comparison results without letting ML override the live rule engine.

Avoid claims:

- fully operational official emergency-warning ingestion
- validated production flood prediction
- live ML flood alerting
- calibrated hydrological forecasting
- always-live gauge operation in the current repo state

## Remaining weaknesses before final submission

1. Live rainfall and river ingestion are still blocked in the latest verified run.
2. Official warning integration is architected and surfaced, but not yet connected as a stable live feed.
3. Risk thresholds remain heuristic rather than event-calibrated.
4. The current ML dataset is still rule-derived and heavily imbalanced, so ML remains comparison-only.
5. The production build still carries a large main bundle warning.

## Camera-ready artifact list

- [Readme.md](/Users/haleytran/Desktop/Projects/FloodGuard/Readme.md:1)
- [floodguard-frontend/README.md](/Users/haleytran/Desktop/Projects/FloodGuard/floodguard-frontend/README.md:1)
- [docs/abstract.md](/Users/haleytran/Desktop/Projects/FloodGuard/docs/abstract.md:1)
- [docs/poster-copy.md](/Users/haleytran/Desktop/Projects/FloodGuard/docs/poster-copy.md:1)
- [docs/demo-script.md](/Users/haleytran/Desktop/Projects/FloodGuard/docs/demo-script.md:1)
- [docs/ml-scope.md](/Users/haleytran/Desktop/Projects/FloodGuard/docs/ml-scope.md:1)

## Day 5 conclusion

FloodGuard is now in a strong submission state as a reliability-aware flood-awareness prototype. The main story is credible: explainable rule logic, explicit source-trust handling, notification safeguards, and a real Python ML shadow pipeline. The main caveat is also clear and verified: current live gauge ingestion is still degraded, so the final submission should highlight honesty and resilience rather than overclaiming current operational coverage.
