import assert from "node:assert/strict";
import test from "node:test";

import { buildIngestionObservabilityReport } from "../ingestionObservability.js";

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
  assert.equal(report.degradedSources[0].failureReason, "cache_recent");
  assert.equal(report.degradedSources[0].lastSuccessfulLiveFetchAt, "2026-07-03T01:15:00Z");
  assert.ok(report.failureTaxonomy.includes("parser_error"));
});
