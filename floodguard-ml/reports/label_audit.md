# FloodGuard Label Audit Report

This report audits the current label files used to improve ML supervision credibility.

## Joined Label Windows (`labels.csv`)

- Rows: 3
- Time span: 2026-06-24T00:00:00+00:00 to 2026-07-02T00:00:00+00:00
- Areas covered: north-parramatta, parramatta, toongabbie
- Label sources: {'manual_demo': 3}
- Label strengths: {'weak': 3}
- Review status: {'scaffold_only': 3}
- Positive event windows: 0

## Event Label Backlog (`event_label_backlog.csv`)

- Rows: 5
- Time span: 2026-06-24T00:00:00+00:00 to 2026-07-02T00:00:00+00:00
- Areas covered: north-parramatta, parramatta, toongabbie
- Label sources: {'manual_demo': 3, 'warning_derived': 1, 'impact_candidate': 1}
- Label strengths: {'weak': 4, 'moderate': 1}
- Review status: {'scaffold_only': 3, 'candidate_review': 2}
- Promotion ready: {'no': 5}
- Positive event windows: 2

## Supervision Quality

- Grade: `weak`
- Viable for independent supervision: `False`
- Summary: Current labels remain scaffold-level and are useful mainly for plumbing, audit, and future calibration preparation.

## Unlabelled Periods / Current Gap

- Most real-export historical rows still do not have strong independently verified elevated labels.
- Backlog rows are planning and review artifacts, not automatic validation evidence.
- Scenario-generated rows must never be treated as real-world label evidence.

## Interpretation

- FloodGuard is now stronger at tracking label provenance and strength explicitly.
- FloodGuard is still weak on validated real-event supervision until backlog items are reviewed and promoted into stronger joined labels.

