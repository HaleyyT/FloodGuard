# FloodGuard Threshold Calibration Report

FloodGuard calibrates thresholds in a reviewable shadow workflow and does not auto-promote threshold changes into operational claims.

- Threshold version under review: `0.3-calibration-review`
- Review status: `needs_domain_expert_review`
- Calibration target kind: `rule`
- Target used: `rule-derived`
- Threshold status: `prototype-calibrated`
- Calibration target reason: Fallback to rule-derived target because event-labelled rows contain only 0 elevated example(s).
- Positive rows available for this target: `18`
- Candidate threshold sets evaluated: `2187`

## Known limitations

- limited independent labels
- no production validation
- current sweep is strongest for replay and expert review, not for automatic promotion
- current event labels are still scaffold or candidate-review supervision rather than verified flood outcomes

## Label quality gate

- Gate passed: `False`
- Candidate event windows: `3000`
- Reviewed event windows: `0`
- Reviewed elevated event windows: `0`
- Event-holdout viable: `False`
- Blockers: `Calibration target is not reviewed-event supervision.; No reviewed event windows are available.; No reviewed elevated event windows are available.; Candidate event windows remain unreviewed or placeholder-backed.; Event-holdout validation is not viable yet.`

## Supervision quality

- Grade: `weak`
- Viable for independent supervision: `False`
- Summary: FloodGuard's current independent supervision remains weak; event labels mainly support plumbing, tracking, and future calibration preparation.
- Primary limitation: Labels are mostly scaffold or candidate-review placeholders rather than evidence-backed reviewed flood outcomes.
- Evidence-backed or reviewed event rows: `0`
- Evidence-backed or reviewed elevated event rows: `0`

## Event-label candidate review

- Candidate rows: `3000`
- Candidate elevated examples: `0`
- Strength counts: `{'weak': 3000}`
- Review status counts: `{'scaffold_only': 3000}`
- Evidence-linked rows: `0`
- Reviewed rows: `0`
- Eligible independent rows: `0`
- Eligible independent positives: `0`

## Current candidate recommendation

- Recommended action: `keep current thresholds for live prototype use; use sweep outputs for expert review`
- Best-ranked review candidate recall: `0.0`
- Best-ranked review candidate false positive rate: `0.0`
- Best-ranked review candidate event windows detected: `0/3`
- Best-ranked review candidate degraded-source suppressed rows: `0`
## Calibration finding

Every swept candidate currently has zero recall against the selected reference target.
This means the exported elevated reference rows are not being recreated by the simple rainfall/river threshold family alone, which is a useful warning for future expert review.
In practice, FloodGuard should keep the current conservative thresholds, improve event labels, and inspect whether elevated rule concern is being driven more by freshness, coverage, public-signal, or other logic outside this calibration scaffold.

## Top sweep rows

### Candidate 1

- Rainfall thresholds: 1h `8.0` mm, 3h `16.0` mm, 24h `40.0` mm, 72h `65.0` mm
- River thresholds: 1h `0.12` m, 3h `0.24` m
- Minimum core coverage: `0.6`
- Recall: `0.0`
- False positive rate: `0.0`
- Time to detection (hours): `None`
- Missed event windows: `3`
- Raw triggered rows: `0`
- Degraded-source suppression rate: `None`

### Candidate 2

- Rainfall thresholds: 1h `8.0` mm, 3h `16.0` mm, 24h `40.0` mm, 72h `65.0` mm
- River thresholds: 1h `0.12` m, 3h `0.24` m
- Minimum core coverage: `0.7`
- Recall: `0.0`
- False positive rate: `0.0`
- Time to detection (hours): `None`
- Missed event windows: `3`
- Raw triggered rows: `0`
- Degraded-source suppression rate: `None`

### Candidate 3

- Rainfall thresholds: 1h `8.0` mm, 3h `16.0` mm, 24h `40.0` mm, 72h `65.0` mm
- River thresholds: 1h `0.12` m, 3h `0.24` m
- Minimum core coverage: `0.8`
- Recall: `0.0`
- False positive rate: `0.0`
- Time to detection (hours): `None`
- Missed event windows: `3`
- Raw triggered rows: `0`
- Degraded-source suppression rate: `None`

### Candidate 4

- Rainfall thresholds: 1h `8.0` mm, 3h `16.0` mm, 24h `40.0` mm, 72h `65.0` mm
- River thresholds: 1h `0.12` m, 3h `0.3` m
- Minimum core coverage: `0.6`
- Recall: `0.0`
- False positive rate: `0.0`
- Time to detection (hours): `None`
- Missed event windows: `3`
- Raw triggered rows: `0`
- Degraded-source suppression rate: `None`

### Candidate 5

- Rainfall thresholds: 1h `8.0` mm, 3h `16.0` mm, 24h `40.0` mm, 72h `65.0` mm
- River thresholds: 1h `0.12` m, 3h `0.3` m
- Minimum core coverage: `0.7`
- Recall: `0.0`
- False positive rate: `0.0`
- Time to detection (hours): `None`
- Missed event windows: `3`
- Raw triggered rows: `0`
- Degraded-source suppression rate: `None`

## Interpretation warning

This sweep currently ranks threshold sets against rule-derived reference targets because no elevated independent event windows are joined yet.
That means the workbench is valuable for replay plumbing, degraded-source review, and expert discussion, but it is not evidence that a new threshold set is validated.
Until FloodGuard has evidence-backed reviewed event windows, calibration should be described as prototype-only rather than evidence-backed.

