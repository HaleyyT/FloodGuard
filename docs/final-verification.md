# FloodGuard Final Verification

_Updated: 2026-07-06_

## Purpose

This note freezes the final verification evidence for the FloodGuard Coding Fest submission package.

## Verified commands

All commands below were run from the local project workspace during the current camera-ready verification cycle.

### Frontend / backend checks

Run from [floodguard-frontend/package.json](/Users/haleytran/Desktop/Projects/FloodGuard/floodguard-frontend/package.json:1):

| Command | Result | Notes |
|---|---|---|
| `npm run lint` | pass | ESLint completed with no reported errors. |
| `npm run test` | pass | `96/96` backend, ingestion, and contract tests passed. |
| `npm run build` | pass with warning | Production build succeeds; Vite still reports a large main chunk warning. |
| `npm run export:ml-dataset` | pass | Exported `3000` feature rows to `floodguard-ml/data/`. |
| `npm run check:ingestion -- --no-refresh` | pass with degraded external source | Submission readiness passes because degraded external sources are labelled honestly while core flood gauges remain usable. |
| `npm run check:ingestion:live -- --no-refresh` | fail | Strict live-source readiness still fails because context and warning evidence are not currently fresh enough for a full live claim. |

### Python ML checks

Run from [floodguard-ml/README.md](/Users/haleytran/Desktop/Projects/FloodGuard/floodguard-ml/README.md:1) using `python3.12`:

| Command | Result | Notes |
|---|---|---|
| `python3.12 -m py_compile src/*.py` | pass | Python source compiles successfully. |
| `python3.12 -m unittest tests/test_audit_labels.py tests/test_build_event_review_queue.py tests/test_build_dataset.py tests/test_validation_controls.py tests/test_calibrate_thresholds.py tests/test_feature_quality.py tests/test_replay_events.py tests/test_promote_reviewed_labels.py` | pass | Focused ML/review/calibration suite passed `33/33` tests. |
| `python3.12 src/evaluate.py` | pass | Prototype ML evaluation completed and wrote reports/models artifacts. |
| `python3.12 src/model_card.py` | pass | Model card regenerated successfully. |

Important environment note:

- The vendored scientific Python stack is currently compatible with `python3.12`, not the default `python3.13`.

## Manual browser demo check

Final manual in-app browser verification passed for:

- Parramatta
- North Parramatta
- Toongabbie

Verified in each area:

- concern summary visible
- rainfall card visible
- river card visible
- source evidence card visible
- official warning state clearly labelled
- ML card says `Shadow mode`
- ML wording remains non-operational
- stale/cached handling is not presented as live

## Current ingestion reality

During the final readiness check:

- rainfall source was current
- river source was current
- weather context was stale
- official warnings were connected through the public HazardWatch source but the warning timestamp was older than the live window

FloodGuard handled this correctly by:

- blocking strict live-source readiness
- allowing submission readiness to pass only because degraded state was labelled honestly
- avoiding any false live-data claim in the dashboard or readiness output

## Camera-ready wording guardrails

The final showcase wording should continue to preserve these boundaries:

- FloodGuard is a flood-awareness and decision-support prototype.
- FloodGuard is not an official emergency-warning system.
- Official warnings stay separate from FloodGuard-generated local concern.
- ML remains shadow mode only and does not control live alerts.
- Thresholds remain prototype-calibration pending unless reviewed event evidence and expert review say otherwise.

## Known caveats

- Strict live ingestion is not currently passing.
- Official warning integration is now connected by default through a public HazardWatch adapter, but it is not yet mature enough to count as fully live-operational warning evidence in every run.
- The production build still emits a bundle-size warning.
- The current ML dataset remains rule-derived and heavily imbalanced, so ML stays shadow mode only.

## Final submission interpretation

FloodGuard should be described as:

> a reliability-aware flood-awareness and decision-support prototype with explainable rule logic, conservative degraded-source handling, and a Python ML shadow-mode comparison pipeline.

FloodGuard should not be described as:

- an official warning system
- a fully live operational flood monitoring platform
- a validated production ML flood predictor
