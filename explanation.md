# FloodGuard Explanation Guide

This file explains FloodGuard in plain language so a beginner, judge, teammate, or audience member can understand:

- what FloodGuard is trying to do;
- how the backend and dashboard work together;
- how the rule engine makes decisions;
- what the ML layer does and does not do;
- what is already strong;
- what is still limited.

---

## 1. What FloodGuard is

FloodGuard is a **reliability-aware flood-awareness and decision-support prototype**.

It is designed for three pilot areas:

- Parramatta
- North Parramatta
- Toongabbie

Its main job is not to replace NSW SES or BoM.

Its real job is to answer four practical questions clearly:

1. What is happening locally?
2. Can I trust the evidence?
3. Why did FloodGuard assign this concern level?
4. What should I check next?

That is why FloodGuard focuses so much on:

- evidence freshness;
- live vs cached vs stale data;
- source provenance;
- explainable concern logic;
- conservative wording;
- honest ML boundaries.

---

## 2. Big-picture system flow

At a high level, FloodGuard works like this:

1. Public data sources are fetched or read from fallback/cache.
2. Each source is checked for freshness, mode, and reliability.
3. Signals are mapped to the correct local area.
4. Flood-related features are calculated from rainfall, river, wetness, and coverage information.
5. The rule engine turns those features into an explainable concern level.
6. The dashboard presents both the decision and the evidence behind it.
7. Historical rows are stored so FloodGuard can export datasets and run offline ML experiments.
8. The ML layer stays in shadow mode and never overrides the live rule engine.

---

## 3. Project structure

### `floodguard-frontend/`

This contains:

- the React dashboard;
- the Node API server;
- ingestion logic;
- risk engine logic;
- tests for backend contracts and dashboard presentation.

Important backend files:

- `server/server.js`
  What the API exposes to the frontend.
- `server/ingestion/aggregators.js`
  Pulls different source layers together into one area snapshot.
- `server/ingestion/riskEngine.js`
  Computes the rule-based concern logic.
- `server/ingestion/health.js`
  Decides whether the system is live, partial, blocked, stale, or missing.
- `server/ingestion/store.js`
  Stores history snapshots and cache artifacts.
- `server/ingestion/mlReport.js`
  Reads ML report outputs safely for the dashboard.

Important frontend files:

- `src/App.jsx`
  Main dashboard composition and page layout.
- `src/dashboardPresentation.js`
  Converts backend data into user-friendly wording and display models.
- `src/App.css`
  Styling and layout.

### `floodguard-ml/`

This contains the Python ML workspace.

It is responsible for:

- building datasets;
- auditing labels;
- replaying history;
- calibrating thresholds;
- training prototype models;
- generating model reports.

Important ML files:

- `src/build_dataset.py`
  Builds the training dataset and synthetic scenario dataset.
- `src/evaluate.py`
  Runs model evaluation and reporting.
- `src/replay_events.py`
  Replays historical windows for rule vs ML vs warning review.
- `src/calibrate_thresholds.py`
  Sweeps threshold candidates for review.
- `src/audit_labels.py`
  Audits label coverage and label quality.

---

## 4. Ingestion and reliability logic

FloodGuard does not assume that a source is trustworthy just because it returned a response.

Each source is checked for:

- whether it is live or fallback;
- whether it is current or stale;
- when it was last fetched;
- when it was last observed;
- whether it failed;
- why it failed.

This is one of the most important design ideas in the whole project.

Why?

Because flood-related decisions are dangerous if stale or degraded data is quietly shown as live.

So FloodGuard separates:

- `live`
- `partial`
- `blocked`
- `missing`
- `cached_recent`
- `cached_stale`
- `not_connected`

Instead of pretending everything is okay, the system says explicitly when evidence is degraded.

That is why FloodGuard can honestly show messages such as:

- "Older cached reading"
- "Not connected yet"
- "ML comparison only"
- "cached rainfall/river evidence is blocked from live claims"

---

## 5. Area mapping and local context

FloodGuard is not only about "is there rain somewhere?"

It also tries to answer:

- is that signal relevant to this suburb?
- which nearby river station is most relevant?
- how strong is the area mapping?

That is why the system keeps:

- area IDs;
- configured catchments;
- station mapping;
- nearest-station distance;
- area signal fit;
- spatial relevance notes.

This helps FloodGuard say not only what data exists, but whether the data is a good local fit.

---

## 6. Rule engine logic

The core concern decision is currently rule-based.

That is intentional.

FloodGuard uses a transparent rule engine first because:

- it is easier to explain;
- it is safer for a prototype;
- it allows explicit reliability constraints;
- it is a good baseline before stronger validated ML exists.

The rule engine combines several signal families:

- rainfall pressure
- river pressure
- wetness pressure
- evidence confidence
- official warning context
- public signal pressure

The backend already separates the output into interpretable parts like:

- `hazardPressure`
- `evidenceConfidence`
- `officialWarningContext`
- `recommendationType`
- `decisionRecommendation`

So FloodGuard is not just saying "High" or "Low".

It is also saying:

- what raised concern;
- what lowered concern;
- what was excluded;
- what source limitation matters;
- what the user should check next.

That is what makes it feel more like a decision-support system than a black box.

---

## 7. Frontend/dashboard logic

The front page is designed to make the most important answers visible immediately.

The monitored-region card now focuses on:

- current concern level;
- evidence reliability;
- key concern drivers;
- what to check next.

Below that, the dashboard shows supporting evidence such as:

- rainfall trend;
- risk signal breakdown;
- river status;
- public signals;
- map snapshot;
- source evidence;
- ML shadow-mode summary.

The wording was intentionally softened and simplified so non-technical users can understand it quickly.

Examples:

- "Current concern level" instead of a longer question
- "Evidence reliability" instead of technical trust jargon
- "Key concern drivers" instead of a vague diagnostic heading

---

## 8. Scenario demo mode

FloodGuard now includes a clearly labelled overview toggle:

- `Current source state`
- `Scenario stress-test view`

This matters because demos and posters often need to show:

- a calm live/degraded state;
- a higher-pressure example;
- how the system explains stronger concern.

The key safety rule is:

**Scenario mode must never look like live operational data.**

So the scenario view is explicitly marked as:

- simulated;
- demo-only;
- not a live warning;
- not a real official feed.

This is useful because it helps judges and viewers understand how FloodGuard would behave in a stronger event, while preserving honesty.

---

## 9. Historical storage

FloodGuard stores historical snapshots in JSONL right now.

That means each line is one stored area snapshot.

This history is already useful for:

- timeline views;
- replay tooling;
- ML export;
- calibration experiments;
- regression tests.

But it is still a prototype storage layer.

Current strength:

- simple;
- transparent;
- easy to inspect;
- already supports replay and export.

Current limitation:

- not yet a richer long-term event database;
- not as queryable as a stronger SQLite/PostGIS design would be.

---

## 10. ML framework

FloodGuard does have real ML plumbing.

But it does **not** yet have validated production flood prediction.

That difference is extremely important.

### What the ML layer already does

- exports feature datasets from FloodGuard history;
- builds a scenario dataset for stress testing;
- audits label quality;
- runs time-aware validation logic;
- trains baseline models;
- reports metrics and model cards;
- compares shadow ML output with the rule engine.

### Models currently used

FloodGuard has used models such as:

- majority baseline
- logistic regression
- random forest
- extra trees

### What "shadow mode" means

Shadow mode means:

- ML results are visible;
- ML can be compared;
- ML can be studied;
- ML does **not** control live alerts;
- ML does **not** override the rule engine;
- ML is not treated as an emergency authority.

### Why FloodGuard is still careful about ML

The current real dataset still has major limitations:

- too few elevated rows;
- very weak independent event labels;
- little or no true `High` event coverage in real historical export;
- strong class imbalance.

So the current honest position is:

- ML engineering: strong
- ML validation credibility: still weak

That is not a failure.

It is good engineering honesty.

---

## 11. Official warning logic

FloodGuard keeps official warnings separate from FloodGuard-generated local concern.

This is another major safety decision.

Why?

Because official warning systems and local signal fusion are not the same thing.

FloodGuard can:

- ingest warning context;
- check relevance;
- expose adapter state;
- show whether warning data is connected, stale, missing, or unavailable.

But it should not blur official warnings into its own risk score in a misleading way.

So the system treats official-warning context as:

- a separate layer;
- a separate explanation input;
- a separate limitation if unavailable.

---

## 12. What is strongest right now

FloodGuard is strongest in:

- reliability and trust architecture;
- explainable rule-based concern logic;
- source freshness and provenance handling;
- graceful degradation instead of silent failure;
- dashboard evidence visibility;
- conservative next-step wording;
- honest ML boundaries;
- regression protection through unit, replay, failure-injection, and browser smoke tests.

---

## 13. What is still limited

FloodGuard is still limited in a few important ways:

- official warning ingestion is not yet fully operationally mature;
- historical storage is still prototype-grade;
- threshold calibration is still only partially evidence-backed;
- independent event labels are still too weak;
- ML remains shadow mode;
- FloodGuard is not a production emergency-warning system.

Those are not small caveats, and they should be said clearly.

---

## 14. What "excellent standard" means for this project

For FloodGuard, excellent standard does not mean pretending the system is already finished.

It means:

- strong architecture;
- strong honesty;
- strong safety boundaries;
- clear explanation;
- good verification;
- clear future path toward calibration, labels, and validated ML.

That is why FloodGuard's best story is:

> a reliability-aware flood-awareness prototype that combines public evidence, trust checks, explainable concern logic, conservative guidance, replayable history, and shadow-mode ML without overstating what is validated today.

---

## 15. If you are learning this project for the first time

The simplest way to understand FloodGuard is:

1. Read `Readme.md`
2. Read this file
3. Look at `floodguard-frontend/src/App.jsx`
4. Look at `floodguard-frontend/src/dashboardPresentation.js`
5. Look at `floodguard-frontend/server/ingestion/riskEngine.js`
6. Look at `floodguard-frontend/server/ingestion/health.js`
7. Look at `floodguard-ml/src/evaluate.py`
8. Look at `roadmap/progress.md`

If you do that in order, the framework becomes much easier to follow.
