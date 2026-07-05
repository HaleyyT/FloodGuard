# FloodGuard Progress Report

_Last updated: 2026-07-05 (event-window history querying and label-review contract upgrade)_

## Purpose

This document is a progress report for FloodGuard based on the current codebase, tests, and implemented API/UI behavior.

It is intentionally careful about the difference between:

- what is fully implemented;
- what is partially implemented;
- what is scaffolded but not production-ready;
- what is still missing.

---

## Overall Status

FloodGuard is now a credible live-data-informed flood-awareness prototype with a stronger replay, warning-observability, and backend explanation backbone than the previous report reflected.

It is strongest in:

- layered ingestion health and honesty about degraded data;
- source provenance and freshness reporting;
- cache and fallback handling;
- explainable risk features and decision audit output;
- notification decision logic and regression tests;
- explicit expert-oversight framing and visible prototype thresholds;
- ML dataset export, label-join plumbing, and time-aware validation safeguards without overclaiming real ML;
- dashboard evidence, history, and front-page summary coverage that make the prototype easier to inspect and demo.

It is not yet a production emergency-warning system, and it is not yet a validated ML flood-prediction system.

---

## Progress Snapshot

These percentages are intentionally honest and reflect implemented code, tests, reports, and current limitations rather than optimism.

| Area | Progress | Why |
|---|---:|---|
| Core prototype / backend framework | **91%** | ingestion, health, cache, source registry, explainable risk, notifications, replay storage, queryable history windows, and API contracts are now strongly integrated |
| Reliability / trust architecture | **94%** | one of the strongest parts of FloodGuard; live vs cached vs stale vs missing vs fallback is handled clearly and now more deeply observable |
| Frontend dashboard / evidence UX | **88%** | strong overview, evidence, warning, map, signals, and ML panels exist; the front page now explains concern, trust, next steps, and simulated demo scenarios more clearly |
| Official warning layer | **74%** | architecture, adapter states, relevance filtering, failure categories, and warning observability are implemented more strongly, though full live operational maturity is still not there |
| Historical data foundation | **83%** | snapshot history, deduplication, replay SQLite output, decision-audit storage, queryable event-window history, and review-oriented summary contracts now exist, though the long-term store is still prototype-grade |
| Rule engine / explainable concern logic | **87%** | feature engineering and risk reasoning are strong, and the backend now exposes a cleaner risk-intelligence explanation contract alongside the detailed audit |
| Testing / regression protection | **92%** | backend, ML, replay, failure-injection, and browser smoke coverage are strong and now include richer history-window and supervision-reporting contracts |
| ML engineering / shadow pipeline | **86%** | Python training, model comparison, validation controls, target selection, calibration, replay summaries, promotion reporting, and label-review auditing are implemented well |
| Validated ML / real predictive credibility | **41%** | still limited by weak independent labels and sparse real elevated supervision, but event-backlog review signals and evidence-linked supervision auditing are now more concrete and actionable |
| Overall project toward credible prototype goal | **89%** | FloodGuard is already a strong reliability-aware prototype with stronger replay/reporting depth, queryable review windows, and clearer backend trust contracts |
| Overall project toward final long-term vision | **75%** | still missing stronger labels, expert-calibrated live warning maturity, and truly validated event supervision, but the architecture and review workflow are materially closer to that destination |

---

## Progress Since The Previous Report

Newer work completed since the earlier progress snapshot includes:

- historical snapshot storage and `/api/history` support;
- stronger feature engineering outputs such as rolling rainfall windows, river deltas, wetness/pressure context, and confidence-style metrics;
- notification candidate and suppression logic with preview/dashboard support;
- API contract tests for dashboard-facing endpoints;
- ML-readiness endpoints and Python-oriented scaffold preparation for later real ML work;
- mapping evidence and dashboard smoke-test coverage;
- clearer framework comments across important FloodGuard logic;
- front-page dashboard refactoring to emphasize rainfall, river, map, actions, and public signals more clearly.
- expert-review documentation and explicit safety-boundary wording across README, poster copy, and demo script;
- visible prototype threshold configuration with review metadata instead of hidden-only threshold code;
- label-strategy documentation, `labels.csv`, and a joined ML training dataset contract;
- time-aware ML validation reporting, leakage-control checks, and validation-summary generation.
- stronger ML feature-quality reporting and model-comparison outputs;
- a central ML model registry with an added `extra_trees` ensemble baseline;
- honest target-selection logic so the Python pipeline can choose event-style supervision only when it is actually viable;
- `target_selection_summary.md` plus refreshed model-card/report outputs;
- `/api/ml/report` contract updates so target-selection honesty is visible to the frontend;
- dashboard ML panel updates so the app now explains whether training currently uses the rule target or event target and why.
- resident-facing overview cards that answer the first-page questions more directly: current concern, whether the evidence can be trusted, why the concern was assigned, and what to check next;
- softer, safer front-end wording for source modes and ML state such as "Older cached reading", "Not connected yet", "ML comparison only", and "Rule-derived ML target";
- new presentation tests covering plain-language trust/explanation behavior so this UX improvement is protected by regression checks.
- a deterministic Playwright smoke suite that now verifies the dashboard loads, areas switch correctly, degraded evidence is not presented as live, and the new scenario demo mode stays clearly simulated;
- expanded replay tests covering low, warning-active, degraded, and ML-disagreement scenarios;
- failure-injection tests for corrupt history rows, malformed ML reports, and richer ingestion-observability failure taxonomy;
- a resident-facing overview mode switcher so the dashboard can show a clearly labelled simulated stress-test scenario without confusing it with live conditions;
- a beginner-friendly explanation document that walks through FloodGuard's architecture, trust logic, and ML scope in plain language.
- verification of the supervision-quality and threshold-calibration upgrades against their plan definitions, with tests rerun and report outputs rechecked;
- a richer official-warning contract that now exposes versioning, status reasoning, failure category, source mode, and warning freshness minutes;
- replayable decision-audit storage so historical snapshots now preserve more of FloodGuard's reasoning rather than only final scores;
- a new `decision_audits` SQLite replay table plus `history_replay_summary.json` for machine-readable historical review;
- `/api/ml/report` integration for historical replay summary so replay evidence now sits beside calibration, promotion policy, and supervision reporting;
- a versioned risk-intelligence contract with a compact `decisionSummary` layer for future non-UI consumers;
- richer ingestion-observability rows that now show source role, live-claim eligibility, and age since last successful live fetch.
- `/api/history` support for explicit start/end event windows plus an opt-in review summary contract, while preserving the old array response the dashboard already uses.
- backend history summaries that now count concern levels, official-warning context, degraded-record rate, and latest decision state for calibration/replay review.
- a stronger event-label backlog contract with independence level, review priority, join status, and evidence-link placeholders.
- richer label-audit outputs and `/api/ml/report` supervision summaries that now distinguish evidence-linked backlog rows from fully joined reviewed supervision.

What matters about this:

- the backend is now much closer to a coherent decision-support system than a simple live-data mockup;
- the frontend is much stronger at exposing evidence, trends, trust, and next-step guidance;
- the project now has a clearer professional story around safety, expert review, and what ML can honestly claim today;
- the ML layer is now much better at saying not only what model was trained, but also what supervision target was trustworthy enough to use;
- the historical layer is now easier to query in the same event-window shape that calibration, replay review, and future expert validation will need;
- the dashboard is now better at helping a non-technical user understand both the current local concern and how much confidence they should place in the visible evidence;
- the dashboard is also better at demonstrating behaviour under simulated stress-test conditions without weakening the honesty of the live/degraded source story;
- the project still remains rule-based and prototype-grade in the places where it should be described carefully.

---

## Current ML Position

Status: `Strong shadow-mode engineering with replay and promotion controls, still weak validated supervision`

What is now implemented:

- Python dataset builder and scenario dataset generator;
- label-strategy document and label-join contract;
- feature-quality report;
- model registry and multiple baseline models;
- time-aware validation with area/event holdout checks;
- calibration and uncertainty summaries;
- replay SQLite output, markdown replay review, and structured replay-summary reporting;
- target-selection logic that can prefer event supervision when it is truly viable;
- backend and dashboard reporting for model status, target choice, and limitations.

What is still not implemented strongly enough:

- real independent elevated event labels in the export;
- validated event-holdout evidence on real historical flood periods;
- expert-calibrated thresholds linked back into ML target credibility;
- a production-quality predictive model that could justify leaving shadow mode.

Current honest percentage:

- **ML engineering progress:** **84%**
- **ML validation credibility progress:** **38%**

That difference is important:

- FloodGuard is already strong at ML plumbing, safeguards, and reporting.
- FloodGuard is not yet strong at real validated flood prediction.

---

## Progress Against `instruction1.md`

### 1. Refactor health into layered reliability

Status: `Implemented`

What is done:

- `/api/health` returns layered ingestion health.
- `coreFloodStatus`, `contextStatus`, `warningStatus`, and `overallStatus` are implemented.
- Supporting context such as stale weather does not automatically block the whole app.
- Degraded core rainfall/river evidence can still block or warn appropriately.
- The frontend shows reliability states such as live, partial, blocked, stale, and not connected.

What is strong here:

- This is one of the best parts of the project because it shows mature engineering judgement.
- The app is much more honest than a simple green/red status approach.

Remaining limitation:

- This area is much stronger now, but there is still room to improve visual density and information hierarchy for very small screens or poster-style demo layouts.

---

### 2. Make the source registry the trust backbone

Status: `Implemented well`

What is done:

- `/api/source-registry` exists and exposes area-level source evidence.
- Source fields now include strength, freshness, mode, owner, quality-control signals, limitations, and mapping context.
- The frontend has evidence-style panels that reflect source trust and degradation.
- Tests exist for source-registry contract behavior.

What is strong here:

- FloodGuard now has a real provenance layer instead of a hidden backend assumption.
- This materially improves demo quality and credibility.

Remaining limitation:

- Some registry detail is still more technical than a general resident user needs, so continuing to separate expert detail from first-screen guidance would help.

---

### 3. Add latest-valid cache and robust fetch behaviour

Status: `Implemented`

What is done:

- Live fetches can fall back to recent cache when a live source fails.
- Cached recent and cached stale modes are distinguished.
- Stale cache does not pretend to be live.
- Health/reporting surfaces degraded fetch behavior.
- Tests cover recent cache, stale cache, and missing-cache paths.

What is strong here:

- This is a high-value reliability improvement.
- The app now degrades gracefully instead of collapsing or silently lying.

Remaining limitation:

- The current cache logic is still file-based and local; it is not yet backed by a stronger shared persistence layer.

---

### 4. Store historical readings before doing serious ML

Status: `Partially implemented`

What is done:

- History is stored in JSONL form.
- Area history can be queried through `/api/history`.
- Deduplication logic exists for identical snapshots.
- Stored records now preserve useful source-reading metadata.
- Tests cover storage, deduplication, and rolling-window history reads.

What is still limited:

- This is snapshot history, not a full high-resolution event store.
- It is useful for early features and experiments, but still limited for stronger calibration and later ML work.
- JSONL is acceptable for the prototype stage, but not ideal long term if scale or query complexity grows.

---

### 5. Strengthen feature engineering and explainable risk logic

Status: `Implemented well`

What is done:

- Rolling rainfall windows exist for 1h, 3h, 24h, and 72h.
- River deltas, trend, wetness, and pressure scores are computed.
- Confidence/freshness/coverage-style signals exist.
- Decision-audit output is returned with score explanation and reliability context.
- Tests exist for feature calculations and risk behavior.

What is strong here:

- This is real feature engineering, not just UI decoration.
- The backend now has a believable explainable rule engine foundation.

Remaining limitation:

- Thresholds and formulas are still heuristic and not yet calibrated against validated historical flood events.

---

### 6. Add notification evaluator and decision rules

Status: `Implemented`

What is done:

- Notification logic exists and is separated from risk scoring.
- Official warning notifications are kept separate from FloodGuard-generated alerts.
- Degraded evidence can suppress strong app-generated alerts.
- Duplicate and cooldown-related suppression behavior exists.
- Reliability degraded/restored notifications exist.
- `/api/notifications` and `/api/notifications/preview` exist.
- Notification-decision tests exist.

What is strong here:

- The app is deliberately conservative, which is the right decision for a flood-awareness prototype.

Remaining limitation:

- This is still candidate generation logic, not a full delivery system with user preferences, channels, acknowledgements, or persistent send history.

---

### 7. Add HazardWatch / NSW SES warning integration

Status: `Partially implemented`

What is done:

- A warning layer and warning status contract now exist.
- `/api/warnings` and `/api/warnings/:area` exist.
- Official warnings are treated separately from FloodGuard risk in both backend and frontend logic.
- Warning adapter states such as `not_configured`, `source_unavailable`, `stale`, and `no_relevant_warning` exist.

What is not fully done:

- The integration is still mostly contract-first and UI-ready.
- There is not yet a fully connected, battle-tested live HazardWatch/NSW SES ingestion pipeline in the same mature sense as the rainfall/river backbone.

This is important:

- FloodGuard now has the correct architecture for official warnings.
- But it would be inaccurate to claim that official warning ingestion is fully operational and validated end-to-end in production conditions.

---

### 8. Keep ML in shadow mode for now

Status: `Implemented honestly`

What is done:

- ML is presented as readiness/scaffolding rather than a production claim.
- `/api/ml/readiness` exists.
- Dataset quality, baseline prediction, model experiment, and model card endpoints exist.
- The UI exposes baseline/model-readiness style panels.
- The project explicitly acknowledges rule-derived labels and lack of independent ground truth.

What is strong here:

- This is intellectually honest.
- The project avoids pretending that experimental modelling is already validated ML.

Remaining limitation:

- The current ML-related outputs are still mostly shadow-mode and comparison tooling.
- They should not be described as real predictive intelligence yet.

---

### 9. Add dashboard evidence and professional messaging

Status: `Implemented substantially`

What is done:

- Source evidence and reliability states are visible in the frontend.
- Decision audit is surfaced.
- Official warning status is separated visually.
- Data evidence and source-health style panels exist.
- History, notifications, and model-readiness views now connect to dashboard-facing API endpoints.
- The front page now prioritises actions, rainfall trend, river state, map context, and public signals more clearly.
- Mapping evidence and dashboard smoke coverage have been added.
- The UI now communicates trust, degradation, and evidence better than before.

Remaining limitation:

- Some panels are still fairly dense and technical.
- There is still room to improve clarity, hierarchy, and judge-facing polish.
- Some of the newest dashboard layout polish is currently in the working tree and may not all be reflected on `main` yet.

---

### 10. Suggested implementation order / roadmap sequence

Status: `Mostly followed`

What has been covered strongly:

- health and evidence;
- cache and history foundations;
- stronger features and decision audit;
- notifications;
- official warning contract layer;
- ML readiness and model-card style scaffolding.

What remains weaker or incomplete:

- stronger real-event calibration and independent validation;
- stronger real-world official warning ingestion;
- independent labels and real ML training;
- stronger long-term data storage strategy.

---

## Testing Progress

Status: `Strong for current prototype phase`

Implemented test areas include:

- ingestion health tests;
- FloodSmart adapter tests;
- source freshness tests;
- risk-engine tests;
- history storage tests;
- latest-valid cache tests;
- feature calculation tests;
- notification-decision tests;
- API contract tests;
- source-registry tests;
- dashboard smoke and mapping-evidence coverage.

Current testing strength:

- The project now has meaningful regression coverage around the most credibility-sensitive logic.

Current testing limitation:

- There is still limited true end-to-end UI/browser verification.
- The tests are strongest at backend contract and logic level, not at full deployment/integration level.
- The current suite is good at protecting data logic and API behavior, but still lighter on visual regression and real multi-service live-feed verification.

---

## Strengths

- FloodGuard is now ready for a prototype about live vs cached vs stale vs missing data.
- The project has a strong evidence-first architecture.
- Risk is explainable rather than opaque.
- Official warnings are kept separate from local gauge-derived concern.
- The source-registry and decision-audit layers are strong demo assets.
- The codebase now has much better commentary and test coverage around the core framework logic.
- ML is framed carefully and professionally instead of being exaggerated.
- The frontend now gives a more coherent front-page summary of what matters first: conditions, trends, trust, and actions.
- The safety boundary is now much clearer and more credible for judges, reviewers, and future domain experts.

---

## Limitations

- Official warning ingestion is architecturally prepared but not yet fully mature as a live connected production-quality pipeline.
- Historical storage is still lightweight and prototype-oriented.
- Thresholds and scoring formulas are still heuristic rather than validated through systematic calibration.
- ML validation is stronger than before, but independent elevated event labels are still missing.
- The frontend is stronger than before, but some panels are still more engineering-facing than resident-facing.
- There is still no true production notification delivery stack.
- Community reports and evidence review are useful prototype features, but verification remains limited.
- The newest dashboard/UI refinements should still be checked visually across more screen sizes and scenarios.

---

## Weaknesses / Risks

This section is intentionally candid.

### 1. Validated ML is still not implemented yet

The project has:

- a real Python ML prototype pipeline;
- dataset readiness checks;
- feature tables;
- label-strategy and label-join infrastructure;
- time-aware validation and leakage-control reporting;
- metrics and model-card style reporting;
- shadow-mode dashboard/API integration.

It does not yet have:

- independent ground-truth labels;
- strong event-holdout validation against real events;
- a trained and validated production-quality model.

If described carelessly, this would be easy to overclaim. That would be a serious credibility risk.

### 2. Calibration is still weak

The rule engine is thoughtful, but its thresholds are still mostly handcrafted.

That means:

- the logic is explainable;
- but not yet well calibrated against verified flood outcomes.

This is a real scientific/engineering gap, not just a documentation gap.

### 3. Storage architecture is still prototype-grade

JSONL history is fine for now, but it is not the strongest long-term foundation for:

- larger-scale analytics;
- replay studies;
- calibration experiments;
- more advanced ML training.

### 4. Warning integration is more mature in interface than in live operational depth

The app now models the warning layer correctly, but that does not yet mean the official warning feed integration is fully robust in real-world operations.

### 5. The app is strong as a decision-support prototype, not as an emergency authority

FloodGuard should still be described as:

- a flood-awareness prototype;
- a decision-support and reliability-focused system;
- a local evidence dashboard.

It should not be described as:

- an official warning system;
- a production emergency alert platform;
- a validated predictive ML flood model.

---

## Recommended Next Priorities

If continuing from here, the highest-value next steps are:

1. Strengthen real official warning ingestion and validation.
2. Collect or link stronger independent outcome labels and real event periods.
3. Calibrate thresholds against historical flood/event periods with expert review.
4. Improve historical data quality and storage depth.
5. Extend ML validation from rule-derived comparison into real event holdout once labels exist.
6. Add more end-to-end UI verification and deployment-level checks.

---

## Honest One-Paragraph Summary

FloodGuard has progressed from a basic live-data prototype into a much stronger reliability-aware flood-awareness system with layered health checks, source provenance, cache resilience, historical snapshot storage, explainable rule-based risk features, notification decision logic, official-warning separation, visible safety/expert-oversight framing, dashboard evidence panels, and a Python ML shadow pipeline with label-join and time-aware validation guardrails. Its biggest strengths are honesty, evidence visibility, safety framing, test-backed backend structure, and a much clearer front-page story for users. Its biggest weaknesses are that real official warning ingestion is still not fully mature, calibration is still heuristic, historical storage is still prototype-grade, and no validated production ML model exists yet.

---

## Day 5 Submission Polish

Status: `Implemented`

What was completed:

- overview page was refactored so the first screen now shows the most useful operational cards together;
- compact source-evidence, official-warning, and ML shadow-mode cards were added back into the overview flow;
- rainfall card now includes latest, peak, and observed-total summary tiles for clearer screenshot reading;
- map styling was improved for cleaner poster/demo visuals;
- root/project documentation was rewritten to match the actual implemented state;
- abstract, poster copy, demo script, and submission-readiness notes were added under `docs/`;
- verification was rerun with `lint`, `test`, `build`, and `check:ingestion`.

Current outcome:

- frontend quality and project narrative are stronger;
- test and build status are strong;
- ingestion honesty still reports a blocked live-gauge state, which remains the main submission caveat.
