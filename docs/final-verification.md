# FloodGuard Final Verification

_Updated: 2026-07-02_

## Purpose

This note freezes the final verification evidence for the FloodGuard Coding Fest submission package.

## Verified commands

All commands below were run from the local project workspace on July 2, 2026.

### Frontend / backend checks

Run from [floodguard-frontend/package.json](/Users/haleytran/Desktop/Projects/FloodGuard/floodguard-frontend/package.json:1):

| Command | Result | Notes |
|---|---|---|
| `npm run lint` | pass | ESLint completed with no reported errors. |
| `npm run test` | pass | `55/55` backend and contract tests passed after adding ingestion-readiness coverage. |
| `npm run build` | pass with warning | Production build succeeds; Vite still reports a large main chunk warning. |
| `npm run export:ml-dataset` | pass | Exported `3000` feature rows to `floodguard-ml/data/`. |
| `npm run check:ingestion` | pass with degraded external source | Submission readiness passes because stale/cached external sources are labelled honestly. |
| `npm run check:ingestion:live` | fail | Strict live-source readiness still fails because rainfall and river are not currently fresh live readings. |

### Python ML checks

Run from [floodguard-ml/README.md](/Users/haleytran/Desktop/Projects/FloodGuard/floodguard-ml/README.md:1) using `python3.12`:

| Command | Result | Notes |
|---|---|---|
| `python3.12 -m py_compile src/*.py` | pass | Python source compiles successfully. |
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

- rainfall source was available only as stale cached evidence
- river source was available only as stale cached evidence
- official warnings were still not connected

FloodGuard handled this correctly by:

- blocking strict live-source readiness
- allowing submission readiness to pass only because degraded state was labelled honestly
- avoiding any false live-data claim in the dashboard or readiness output

## Known caveats

- Strict live ingestion is not currently passing.
- Official warning integration remains contract-aware but not fully live-operational.
- The production build still emits a bundle-size warning.
- The current ML dataset remains rule-derived and heavily imbalanced, so ML stays shadow mode only.

## Final submission interpretation

FloodGuard should be described as:

> a reliability-aware flood-awareness and decision-support prototype with explainable rule logic, conservative degraded-source handling, and a Python ML shadow-mode comparison pipeline.

FloodGuard should not be described as:

- an official warning system
- a fully live operational flood monitoring platform
- a validated production ML flood predictor
