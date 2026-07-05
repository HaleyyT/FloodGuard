# FloodGuard Historical Replay

FloodGuard replays committed history into SQLite so rule concern, warning state, source freshness, labels, and shadow ML outputs can be reviewed by area and time.

- SQLite path: `/Users/haleytran/Desktop/Projects/FloodGuard/floodguard-data/floodguard_history.sqlite`
- Dataset rows replayed: `3000`
- Shadow model outputs available: `yes`
- Note: current label backlog still contains placeholder non-event windows, so replay is stronger for plumbing and review than for event-level calibration claims.

## north-parramatta

- Window: `2026-06-24T00:00:00+00:00` to `2026-07-02T00:00:00+00:00`
- Label window: `0` from `manual_demo` with strength `weak`
- Review status: `scaffold_only`
- Evidence quality: `no_evidence`
- Rule concern peak: `Moderate` across `998` snapshot(s)
- Warning states seen: `no_current_warning`
- Shadow ML max elevated probability: `0.9855`
- Shadow ML status: `available`
- Rule vs ML agreement: `0.612`
- Degraded-source rows: `627`
- Evidence-confidence states: `none recorded`
- Recommendation types: `none recorded`
- Source modes/freshness: `rainfall:local-fallback, rainfall:remote, rainfall:remote-derived, river:local-fallback, river:remote, river:unavailable, warnings:not-configured, weather:local-fallback, weather:remote`
- Latest replayed snapshot: `2026-06-30T06:56:47.412000+00:00`
- Limitations: `No evidence link is attached to this replay window.; Window is scaffold_only and exists for plumbing or baseline context.; Replay supports review, not event-holdout validation.`

## parramatta

- Window: `2026-06-24T00:00:00+00:00` to `2026-07-02T00:00:00+00:00`
- Label window: `0` from `manual_demo` with strength `weak`
- Review status: `scaffold_only`
- Evidence quality: `no_evidence`
- Rule concern peak: `Moderate` across `998` snapshot(s)
- Warning states seen: `no_current_warning`
- Shadow ML max elevated probability: `0.9928`
- Shadow ML status: `available`
- Rule vs ML agreement: `0.611`
- Degraded-source rows: `627`
- Evidence-confidence states: `none recorded`
- Recommendation types: `none recorded`
- Source modes/freshness: `rainfall:local-fallback, rainfall:remote, rainfall:remote-derived, river:local-fallback, river:remote, river:unavailable, warnings:not-configured, weather:local-fallback, weather:remote`
- Latest replayed snapshot: `2026-06-30T06:56:47.412000+00:00`
- Limitations: `No evidence link is attached to this replay window.; Window is scaffold_only and exists for plumbing or baseline context.; Replay supports review, not event-holdout validation.`

## parramatta

- Window: `2026-06-29T00:00:00+00:00` to `2026-06-29T12:00:00+00:00`
- Label window: `1` from `warning_derived` with strength `moderate`
- Review status: `candidate_review`
- Evidence quality: `placeholder`
- Rule concern peak: `unavailable` across `0` snapshot(s)
- Warning states seen: `none recorded`
- Shadow ML max elevated probability: `unavailable`
- Shadow ML status: `unavailable`
- Rule vs ML agreement: `unavailable`
- Degraded-source rows: `0`
- Evidence-confidence states: `none recorded`
- Recommendation types: `none recorded`
- Source modes/freshness: `legacy history only`
- Latest replayed snapshot: `None`
- Limitations: `Evidence link is a placeholder and cannot validate this event window.; Window is candidate_review only and must not count as reviewed supervision.; Replay supports review, not event-holdout validation.`

## toongabbie

- Window: `2026-06-24T00:00:00+00:00` to `2026-07-02T00:00:00+00:00`
- Label window: `0` from `manual_demo` with strength `weak`
- Review status: `scaffold_only`
- Evidence quality: `no_evidence`
- Rule concern peak: `Moderate` across `998` snapshot(s)
- Warning states seen: `no_current_warning`
- Shadow ML max elevated probability: `0.9938`
- Shadow ML status: `available`
- Rule vs ML agreement: `1.0`
- Degraded-source rows: `627`
- Evidence-confidence states: `none recorded`
- Recommendation types: `none recorded`
- Source modes/freshness: `rainfall:local-fallback, rainfall:remote, rainfall:remote-derived, river:local-fallback, river:remote, river:unavailable, warnings:not-configured, weather:local-fallback, weather:remote`
- Latest replayed snapshot: `2026-06-30T06:56:47.412000+00:00`
- Limitations: `No evidence link is attached to this replay window.; Window is scaffold_only and exists for plumbing or baseline context.; Replay supports review, not event-holdout validation.`

## toongabbie

- Window: `2026-06-30T00:00:00+00:00` to `2026-06-30T06:00:00+00:00`
- Label window: `1` from `impact_candidate` with strength `weak`
- Review status: `candidate_review`
- Evidence quality: `placeholder`
- Rule concern peak: `unavailable` across `0` snapshot(s)
- Warning states seen: `none recorded`
- Shadow ML max elevated probability: `unavailable`
- Shadow ML status: `unavailable`
- Rule vs ML agreement: `unavailable`
- Degraded-source rows: `0`
- Evidence-confidence states: `none recorded`
- Recommendation types: `none recorded`
- Source modes/freshness: `legacy history only`
- Latest replayed snapshot: `None`
- Limitations: `Evidence link is a placeholder and cannot validate this event window.; Window is candidate_review only and must not count as reviewed supervision.; Replay supports review, not event-holdout validation.`

