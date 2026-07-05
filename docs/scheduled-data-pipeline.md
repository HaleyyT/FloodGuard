# FloodGuard Scheduled Data Pipeline

FloodGuard now includes a small scheduled evidence pipeline for camera-ready credibility hardening.

This automation is intentionally conservative:

- it collects approved public source snapshots;
- it appends raw evidence and parsed metadata without overwriting earlier snapshots;
- it proposes candidate event windows for review;
- it reruns audit, calibration, and shadow ML reports;
- it does **not** promote labels automatically;
- it does **not** move ML beyond shadow mode;
- it does **not** change live thresholds automatically.

## Approved automated sources

These are the sources the pipeline is designed to collect when configured:

1. City of Parramatta FloodSmart rainfall gauges
2. City of Parramatta FloodSmart river gauges
3. BoM Parramatta weather context
4. NSW SES / HazardWatch warning context
5. BoM RSS warning/weather context when `FLOODGUARD_BOM_WARNING_RSS_URL` is configured
6. Hazards Near Me warning context when `FLOODGUARD_HAZARDS_NEAR_ME_URL` is configured
7. Transport NSW Live Traffic / historical incidents when Transport URLs are configured

## Commands

Frontend collection:

```bash
cd floodguard-frontend
npm run collect:sources
```

Shadow report refresh:

```bash
cd floodguard-frontend
npm run refresh:shadow-reports
```

## Storage layout

Collected evidence is append-only and lives under:

```text
floodguard-frontend/server/storage/source-evidence/raw/
floodguard-frontend/server/storage/source-evidence/parsed/
```

Raw snapshots keep the exact fetched payload. Parsed snapshots keep:

- source key and label
- source URL
- fetched time
- observed time if available
- status
- failure reason
- evidence type
- matched areas if any
- warning/incident items used for review queueing

## Candidate-event queue generation

`floodguard-ml/src/build_candidate_event_backlog.py` proposes:

- gauge-threshold candidates from stored area history;
- warning-derived candidates from collected official warning context;
- impact-derived candidates from collected transport-style incident context.

Every generated candidate records:

- source status
- evidence type
- source reference
- area mapping confidence
- promotion blocked reason

These rows stay `candidate_review` only.

## Recommended schedule

- source fetch + history append: hourly
- warning relevance scan: hourly
- candidate-event queue refresh: daily
- audit + calibration report refresh: daily or on source-data change
- shadow retrain/report refresh: weekly or after reviewed-label changes

## Human review still required

Automation does **not** answer these questions for you:

- Is this evidence link real?
- Does it truly match Parramatta, North Parramatta, or Toongabbie?
- Does the event window overlap the local conditions being reviewed?
- Is the event warning-derived, gauge-threshold, or impact-derived?
- Is the label weak, moderate, or strong after inspection?
- Can it become `reviewed_for_shadow_mode`?

Those still require a reviewer to inspect the real evidence and update review metadata deliberately.

## Cron example

```cron
0 * * * * cd /path/to/FloodGuard/floodguard-frontend && npm run collect:sources
15 1 * * * cd /path/to/FloodGuard/floodguard-frontend && npm run refresh:shadow-reports
```

## GitHub Actions / manual alternative

If local cron is not appropriate, the same two commands can run from:

- a scheduled GitHub Actions workflow;
- a deployment platform scheduler;
- a manual operator workflow before demo/report refresh.

## Safety boundary

This pipeline improves evidence collection and reviewer readiness only.

It is **not** an automatic expert-review system, and it must not be described as one.
