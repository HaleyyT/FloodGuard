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
- failure reason
- last successful live fetch

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

## Current boundary

FloodGuard may still pass submission-style readiness when degraded sources are labelled honestly, but it should fail strict live-readiness whenever stale, cached, fallback, or unavailable core rainfall/river evidence would otherwise be mistaken for live data.
