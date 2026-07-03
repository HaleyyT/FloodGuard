# FloodGuard Historical Replay

FloodGuard replays committed history into SQLite so rule concern, warning state, source freshness, labels, and shadow ML outputs can be reviewed by area and time.

- SQLite path: `/Users/haleytran/Desktop/Projects/FloodGuard/floodguard-data/floodguard_history.sqlite`
- Dataset rows replayed: `311`
- Shadow model outputs available: `yes`
- Note: current label backlog still contains placeholder non-event windows, so replay is stronger for plumbing and review than for event-level calibration claims.

## parramatta

- Window: `2026-06-24T00:00:00+00:00` to `2026-07-02T00:00:00+00:00`
- Label window: `0` from `manual_demo` with strength `weak`
- Rule concern peak: `Low` across `311` snapshot(s)
- Warning states seen: `none recorded`
- Shadow ML max elevated probability: `0.7247`
- Rule vs ML agreement: `0.003`
- Degraded-source rows: `311`
- Source modes/freshness: `rainfall:local-fallback, rainfall:remote, rainfall:remote-derived, river:local-fallback, river:remote, river:unavailable, warnings:not-configured, weather:local-fallback, weather:remote`
- Latest replayed snapshot: `2026-06-24T20:19:31.844000+00:00`

## north-parramatta

- Window: `2026-06-24T00:00:00+00:00` to `2026-07-02T00:00:00+00:00`
- Label window: `0` from `manual_demo` with strength `weak`
- Rule concern peak: `unavailable` across `0` snapshot(s)
- Warning states seen: `none recorded`
- Shadow ML max elevated probability: `unavailable`
- Rule vs ML agreement: `unavailable`
- Degraded-source rows: `0`
- Source modes/freshness: `legacy history only`
- Latest replayed snapshot: `None`

## toongabbie

- Window: `2026-06-24T00:00:00+00:00` to `2026-07-02T00:00:00+00:00`
- Label window: `0` from `manual_demo` with strength `weak`
- Rule concern peak: `unavailable` across `0` snapshot(s)
- Warning states seen: `none recorded`
- Shadow ML max elevated probability: `unavailable`
- Rule vs ML agreement: `unavailable`
- Degraded-source rows: `0`
- Source modes/freshness: `legacy history only`
- Latest replayed snapshot: `None`

