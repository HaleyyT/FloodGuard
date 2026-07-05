# FloodGuard Official Warning Ingestion

## Selected target source

FloodGuard currently targets **HazardWatch / NSW SES official warnings** as the primary public warning layer.

The default adapter now reads the public HazardWatch homepage and extracts its embedded alert payload, so the warning layer is configured by default even when no custom `FLOODGUARD_WARNINGS_URL` is supplied.

This source is kept separate from FloodGuard's rule-based concern score and ML shadow-mode outputs.

## Adapter states

The warning adapter now reports one of these explicit states:

- `live`: a current relevant official warning was fetched and parsed safely
- `no_relevant_warning`: the source was current, but no relevant warning matched the area and warning-type filter
- `stale`: the source exists but the latest warning timestamp is too old for current reliance
- `source_unavailable`: the configured source could not be fetched and no safe live result was available
- `not_configured`: no warning source URL is configured yet
- `parser_error`: the configured payload did not match the expected warning schema

## Relevance filtering

FloodGuard currently filters official warnings using:

- area id or suburb-name matching
- catchment-name matching
- warning-type relevance for flood, storm, and emergency wording

This keeps bushfire and unrelated hazard notices from being treated as local flood-context evidence.

## Safety boundary

- Official warning wording stays official and is never rewritten into FloodGuard's own concern level.
- FloodGuard only displays official warning headlines beside local sensor-derived concern.
- Future work should add polygon/catchment intersection once warning geometry is available.

## Stable adapter contract

FloodGuard's warning-status endpoint now keeps a stable contract that can be surfaced to the dashboard or used in tests:

```json
{
  "source": "HazardWatch / NSW SES",
  "contractVersion": "warning-adapter-v2",
  "status": "live | no_relevant_warning | stale | source_unavailable | not_configured | parser_error",
  "statusReason": "human-readable explanation of why this warning state was chosen",
  "warnings": [],
  "lastFetchedAt": "2026-07-03T01:00:00Z",
  "lastObservedAt": "2026-07-03T00:55:00Z",
  "freshnessMinutes": 5,
  "sourceMode": "remote | missing",
  "failureCategory": "network_timeout | parser_error | not_configured | null",
  "relevanceMethod": "area-name-catchment-and-warning-type",
  "limitations": []
}
```

This keeps the warning layer explicit about:

- which official source FloodGuard is targeting;
- whether the source is live, stale, unavailable, or simply has no relevant warning;
- why that state was assigned in plain language and what transport/parser failure category applies;
- how relevance was decided for Parramatta, North Parramatta, and Toongabbie;
- what limitation should be shown instead of pretending the warning layer is stronger than it really is.

## Current live posture

FloodGuard is now connected to the public HazardWatch warning page by default, but it still treats that layer conservatively:

- the source is read from embedded page data rather than a dedicated official JSON feed;
- timestamps may be stale even when the page is reachable;
- the warning layer remains separate from FloodGuard's own concern score and does not override ML shadow mode.
