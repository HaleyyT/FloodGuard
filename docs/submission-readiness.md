# FloodGuard Submission Readiness

_Updated: 2026-07-06_

## Day 5 objective

This note records the current camera-ready state of FloodGuard after the latest documentation, warning-state, and rainfall-history hardening pass.

## Verification checks run

All commands below were run from [floodguard-frontend/package.json](/Users/haleytran/Desktop/Projects/FloodGuard/floodguard-frontend/package.json:1) during the current camera-ready verification cycle.

| Command | Result | Notes |
|---|---|---|
| `npm run lint` | pass | ESLint completed with no reported errors. |
| `npm run test` | pass | `96/96` backend, ingestion, and contract tests passed in the current repo state. |
| `npm run build` | pass with warning | Production build succeeds; Vite reports a large main-chunk warning. |
| `npm run check:ingestion -- --no-refresh` | pass with degraded external source | Submission readiness now passes when degraded external sources are labelled honestly and no false live claim is made. |
| `npm run check:ingestion:live -- --no-refresh` | fail | Strict live readiness still fails because context and warning evidence are not fresh enough for a full live claim. |

## What is now submission-ready

- Overview dashboard is cleaner and screenshot-oriented, with concern summary, rainfall, river, public signals, map context, source evidence, official-warning separation, and ML shadow summary visible without leaving the main flow.
- README and package-level documentation now describe the system honestly and consistently.
- Poster text, abstract text, and demo-script wording now exist in `docs/`.
- ML integration is visible and clearly labelled as shadow mode rather than live decision authority.
- Signals and Model pages are now laid out more consistently with the front page and preserve the same evidence-first visual language.
- Backend verification remains strong, with passing tests and a successful production build.

## Current ingestion reality

`npm run check:ingestion:live -- --no-refresh` currently reports:

- overall ingestion health: `partial`
- core flood gauges: `pass`
- supporting context: `warn`
- official warnings: `warn`

Observed reasons in the latest run:

- FloodSmart rainfall gauge ingestion was current in the checked run.
- FloodSmart river gauge ingestion was current in the checked run.
- Parramatta weather context was stale in the checked run.
- NSW SES / HazardWatch warning ingestion was connected, but the latest warning timestamp was still too old for a strict live claim.

What this means:

- the honesty and degraded-source logic are working correctly;
- the current run is acceptable for submission readiness because degraded-state handling is explicit;
- the current run is not healthy enough to claim fully live all-source operation;
- submission/demo wording must continue to describe live ingestion as architecture with degraded-state handling, not guaranteed current operation.

## Required camera-ready wording

Every showcase-facing document and spoken demo should preserve these points:

- FloodGuard is a flood-awareness and decision-support prototype, not an official emergency-warning system.
- Official warnings are shown separately from FloodGuard-generated local concern.
- ML remains shadow mode only and does not trigger live alerts.
- Thresholds are prototype-calibration pending and still require reviewed event evidence plus expert review.

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

1. Strict live all-source readiness is still not passing in the latest verified run because weather and warning evidence remain degraded even when the core flood gauges are current.
2. Official warning integration is connected by default, but it is not yet mature enough to count as a stable live feed in every run.
3. Risk thresholds remain heuristic rather than event-calibrated.
4. The current ML dataset is still rule-derived and heavily imbalanced, so ML remains comparison-only.
5. The production build still carries a large main bundle warning.

## Camera-ready artifact list

- [Readme.md](/Users/haleytran/Desktop/Projects/FloodGuard/Readme.md:1)
- [floodguard-frontend/README.md](/Users/haleytran/Desktop/Projects/FloodGuard/floodguard-frontend/README.md:1)
- [docs/final-verification.md](/Users/haleytran/Desktop/Projects/FloodGuard/docs/final-verification.md:1)
- [docs/abstract.md](/Users/haleytran/Desktop/Projects/FloodGuard/docs/abstract.md:1)
- [docs/poster-copy.md](/Users/haleytran/Desktop/Projects/FloodGuard/docs/poster-copy.md:1)
- [docs/demo-script.md](/Users/haleytran/Desktop/Projects/FloodGuard/docs/demo-script.md:1)
- [docs/ml-scope.md](/Users/haleytran/Desktop/Projects/FloodGuard/docs/ml-scope.md:1)

## Camera-ready conclusion

FloodGuard is now in a strong camera-ready state as a reliability-aware flood-awareness prototype. The main story is credible: explainable rule logic, explicit source-trust handling, notification safeguards, official-warning separation, historical replay/reporting, and a real Python ML shadow pipeline. The main caveat is also clear and verified: FloodGuard supports honest degraded-state handling and strong prototype reviewability, but it still should not be described as a fully live operational warning platform or as a validated production ML system.
