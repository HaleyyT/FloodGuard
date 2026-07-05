import assert from "node:assert/strict";
import test from "node:test";

import {
  buildIngestionObservabilityReport,
  INGESTION_FAILURE_TAXONOMY,
  summarizeDegradedSourcesForCli,
} from "../ingestionObservability.js";

test("ingestion observability report exposes degraded source taxonomy and debug line", () => {
  const report = buildIngestionObservabilityReport({
    ingestedAt: "2026-07-03T02:00:00Z",
    refreshMetadata: { status: "blocked-refresh", servedAt: "2026-07-03T02:01:00Z" },
    ingestionHealth: { overallStatus: "partial" },
    areas: {
      parramatta: {
        area: { id: "parramatta", name: "Parramatta, NSW" },
        ingestionHealth: { overallStatus: "partial" },
        rainfallSeries: { areaRelevance: { matched: true } },
        riverContext: { areaRelevance: { missingStations: [] }, stationCount: 1 },
        sourceMetadata: [
          {
            label: "FloodSmart rainfall",
            type: "rainfall",
            mode: "cached_recent",
            dataMode: "cached_recent",
            fetchedAt: "2026-07-03T02:00:00Z",
            observedAt: "2026-07-03T01:20:00Z",
            ageMinutes: 40,
            freshnessStatus: "current",
            sourceStrength: "primary_live_gauge",
            note: "Remote fetch failed; recent cached reading was used instead.",
            lastSuccessfulLiveFetchAt: "2026-07-03T01:15:00Z",
          },
        ],
      },
    },
  });

  assert.equal(report.refreshStatus, "blocked-refresh");
  assert.match(report.debugLine, /degraded honestly/i);
  assert.equal(report.degradedSourceCount, 1);
  assert.equal(report.degradedSources[0].contractVersion, "ingestion-observability-v2");
  assert.equal(report.degradedSources[0].failureReason, "cache_recent");
  assert.equal(report.degradedSources[0].coreFloodRole, "core");
  assert.equal(report.degradedSources[0].liveClaimEligible, false);
  assert.equal(report.degradedSources[0].lastSuccessfulLiveFetchAt, "2026-07-03T01:15:00Z");
  assert.equal(report.degradedSources[0].lastSuccessfulLiveAgeMinutes, 45);
  assert.ok(report.failureTaxonomy.includes("parser_error"));
});

test("ingestion observability classifies parser, timeout, unmapped, and unconfigured failure reasons", () => {
  const report = buildIngestionObservabilityReport({
    ingestedAt: "2026-07-03T04:00:00Z",
    refreshMetadata: { status: "degraded", servedAt: "2026-07-03T04:01:00Z" },
    ingestionHealth: { overallStatus: "partial" },
    areas: {
      northParramatta: {
        area: { id: "north-parramatta", name: "North Parramatta, NSW" },
        ingestionHealth: { overallStatus: "partial" },
        rainfallSeries: { areaRelevance: { matched: false } },
        riverContext: { areaRelevance: { missingStations: ["North Parramatta Creek"] }, stationCount: 0 },
        sourceMetadata: [
          {
            label: "Rainfall feed",
            type: "rainfall",
            mode: "unavailable",
            dataMode: "remote",
            fetchedAt: "2026-07-03T04:00:00Z",
            observedAt: "2026-07-03T03:30:00Z",
            freshnessStatus: "current",
            sourceStrength: "primary_live_gauge",
            status: "failed",
            note: "Request timeout while reading rainfall adapter.",
          },
          {
            label: "River feed",
            type: "river",
            mode: "unavailable",
            dataMode: "remote",
            fetchedAt: "2026-07-03T04:00:00Z",
            observedAt: "2026-07-03T03:20:00Z",
            freshnessStatus: "current",
            sourceStrength: "primary_live_gauge",
            status: "failed",
            note: "Unexpected JSON parse error while reading river payload.",
          },
          {
            label: "Mapped rainfall station",
            type: "rainfall",
            mode: "remote",
            dataMode: "remote",
            fetchedAt: "2026-07-03T04:00:00Z",
            observedAt: "2026-07-03T03:50:00Z",
            freshnessStatus: "current",
            sourceStrength: "primary_live_gauge",
            note: "Area mapping failed for the selected suburb.",
          },
          {
            label: "Warning feed",
            type: "warnings",
            mode: "not-configured",
            dataMode: "not-configured",
            freshnessStatus: "not-connected",
            sourceStrength: "official_warning_feed",
            status: "not-connected",
            note: "Official warning source is not configured yet.",
          },
        ],
      },
    },
  });

  const reasons = report.degradedSources.map((source) => source.failureReason);

  assert.ok(reasons.includes("network_timeout"));
  assert.ok(reasons.includes("parser_error"));
  assert.ok(reasons.includes("station_unmapped"));
  assert.ok(reasons.includes("not_configured"));
  assert.ok(report.degradedSources.every((source) => source.contractVersion === "ingestion-observability-v2"));
});

test("ingestion observability keeps a stable failure taxonomy and printable degraded-source lines", () => {
  const report = buildIngestionObservabilityReport({
    ingestedAt: "2026-07-03T04:00:00Z",
    refreshMetadata: { status: "degraded", servedAt: "2026-07-03T04:01:00Z" },
    ingestionHealth: { overallStatus: "partial" },
    areas: {
      parramatta: {
        area: { id: "parramatta", name: "Parramatta, NSW" },
        ingestionHealth: { overallStatus: "partial" },
        rainfallSeries: { areaRelevance: { matched: true } },
        riverContext: { areaRelevance: { missingStations: [] }, stationCount: 1 },
        sourceMetadata: [
          {
            label: "FloodSmart river",
            type: "river",
            mode: "cached_stale",
            dataMode: "cached_stale",
            fetchedAt: "2026-07-03T04:00:00Z",
            observedAt: "2026-07-03T02:10:00Z",
            ageMinutes: 110,
            freshnessStatus: "stale",
            sourceStrength: "primary_live_gauge",
            status: "failed",
            note: "Remote fetch failed; stale cached reading was retained.",
          },
        ],
      },
    },
  });

  assert.deepEqual(report.failureTaxonomy, [...INGESTION_FAILURE_TAXONOMY]);
  assert.equal(report.degradedSources[0].failureReason, "cache_stale");
  assert.equal(report.degradedSources[0].liveClaimEligible, false);

  const lines = summarizeDegradedSourcesForCli(report);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /Parramatta, NSW \| river \| failure=cache_stale/);
  assert.match(lines[0], /sourceMode=cached_stale/);
  assert.match(lines[0], /cacheMode=cached_stale/);
  assert.match(lines[0], /lastFetchedAt=2026-07-03T04:00:00Z/);
  assert.match(lines[0], /lastObservedAt=2026-07-03T02:10:00Z/);
  assert.match(lines[0], /freshnessMinutes=110m/);
  assert.match(lines[0], /liveClaimEligible=false/);
});
