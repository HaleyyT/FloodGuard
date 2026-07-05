# FloodGuard Ingestion Observability

This note explains how FloodGuard makes degraded ingestion states observable instead of hiding them.

## What FloodGuard records per source

- source
- last fetched time
- last observed time
- freshness minutes
- freshness status
- source mode
- cache mode
- whether the source is eligible for live core-flood claims
- whether the source is a core flood input or supporting context
- failure reason
- last successful live fetch
- minutes since the last successful live fetch

These fields are visible through:

- `/api/ingestion-observability` for structured per-source inspection;
- `npm run check:ingestion` and `npm run check:ingestion:live` for reviewer-friendly terminal output when strict readiness fails or a degraded source is present.

## Failure taxonomy

FloodGuard currently classifies degraded ingestion states using:

- `network_timeout`
- `source_unavailable`
- `parser_error`
- `timestamp_stale`
- `station_unmapped`
- `cache_recent`
- `cache_stale`
- `not_configured`

## Why this matters

This lets FloodGuard explain strict live-readiness failures in one sentence:

> Source status: degraded honestly — cached rainfall/river evidence is blocked from live claims.

That is better than a vague red status because it shows whether the issue is:

- the network,
- the source itself,
- stale timestamps,
- station mapping,
- cache fallback,
- or configuration.

## Current CLI visibility

When degraded sources exist, the readiness check now prints a compact observability block such as:

```text
Degraded source observability:
  Source status: degraded honestly — cached rainfall/river evidence is blocked from live claims.
  Parramatta, NSW | river | failure=cache_stale | sourceMode=cached_stale | cacheMode=cached_stale | lastFetchedAt=2026-07-03T04:00:00Z | lastObservedAt=2026-07-03T02:10:00Z | freshnessMinutes=110m | liveClaimEligible=false
```

This makes the strict-vs-submission distinction easier to defend during demo, judging, or expert review because the failure is explicit rather than implied.

## Current boundary

FloodGuard may still pass submission-style readiness when degraded sources are labelled honestly, but it should fail strict live-readiness whenever stale, cached, fallback, or unavailable core rainfall/river evidence would otherwise be mistaken for live data.
