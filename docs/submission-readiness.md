# FloodGuard Submission Readiness

_Updated: 2026-07-01_

## Day 1 objective

This note freezes the current submission scope, records the real verification results, and lists what still needs attention before a camera-ready Coding Fest submission.

## Release branch

- Current Day 1 branch: `release/coding-fest-camera-ready`

## Verification checks run

All commands were run from [floodguard-frontend/package.json](/Users/haleytran/Desktop/Projects/FloodGuard/floodguard-frontend/package.json:1).

| Command | Result | Notes |
|---|---|---|
| `npm run lint` | pass | ESLint completed with no reported errors. |
| `npm run test` | pass | `43/43` backend and contract tests passed. |
| `npm run build` | pass with warning | Production build succeeds; Vite reports a large bundle warning for the main JS chunk. |
| `npm run check:ingestion` | blocked | Current live-ingestion health is blocked because core gauge sources are stale/fallback and official warnings are still not configured. |

## Current implementation audit

| Layer | Current status | Needed before submission |
|---|---|---|
| Live rainfall ingestion | issue | Keep the feature, but describe current runs honestly when live gauges are stale or fetches fail. |
| Live river ingestion | issue | Same as rainfall: keep the backbone, but do not imply guaranteed live availability. |
| BoM weather context | stale / partial | Keep it framed as supporting context rather than the core flood signal. |
| Warning layer | contract-only | State clearly that the warning layer is architected and surfaced, but not fully connected operationally. |
| Source registry | pass | Optionally simplify wording for non-technical judges. |
| Risk engine | pass | Keep a calibration note because thresholds remain heuristic. |
| Notifications | pass | Keep wording conservative and make clear this is candidate logic, not a delivery platform. |
| History | JSONL prototype | Good enough for feature generation and comparison, but document its prototype-grade storage limits. |
| ML | scaffold / shadow-mode backend | Implement the Python training/evaluation pipeline before claiming a prototype ML pipeline is complete. |
| Dashboard | pass / needs polish | Current dashboard is demoable, but final screenshots should use the strongest states and cleanest layouts. |

## Current ingestion reality

`npm run check:ingestion` reported:

- overall ingestion health: `blocked`
- core flood gauges: `blocked`
- supporting context: `warn`
- official warnings: `missing`

Observed reasons in the current run:

- FloodSmart rainfall gauge ingestion failed and fell back to stale cached state.
- FloodSmart river gauge ingestion failed and fell back to stale cached state.
- Parramatta weather observations were unavailable in the current run and remained stale context.
- Official NSW SES / HazardWatch integration is still not configured.

What this means:

- the architecture, fallback handling, and honesty logic are working;
- the live run is not currently healthy enough to claim fully live flood-signal operation without qualification.

## Public claims freeze

Allowed claims:

- live local gauge ingestion architecture exists;
- source freshness, provenance, and degraded-data checks are implemented;
- explainable rule-based flood concern scoring is implemented;
- notification decision logic is implemented;
- historical feature rows and ML-readiness APIs are implemented;
- FloodGuard supports shadow-mode model comparison and a Python ML pipeline path.

Avoid claims:

- official emergency warning system;
- validated production flood prediction;
- operational ML flood alerting;
- calibrated hydrological forecasting system;
- fully connected official-warning feed in production conditions.

## Highest-priority remaining work after Day 1

1. Implement the real Python ML pipeline promised by the project scope, using exported feature rows and shadow-mode evaluation.
2. Keep improving dashboard polish and screenshot selection for submission materials.
3. Either improve live ingestion reliability or document degraded-source behavior very clearly in the final submission.
4. Reduce bundle size if time permits, but treat it as secondary to correctness and honesty.

## Day 1 conclusion

FloodGuard is in a good state for a controlled final sprint:

- the codebase linted cleanly;
- tests passed;
- the production build passed;
- the ingestion audit exposed honest live-data weaknesses instead of hiding them.

The main gap between the current repo and the full 6-day target is no longer the reliability/rule-engine backbone. The main remaining technical gap is turning the existing ML-readiness and shadow-mode scaffolding into a real Python training and evaluation pipeline.
