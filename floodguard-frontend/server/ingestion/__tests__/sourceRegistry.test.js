import assert from "node:assert/strict";
import test from "node:test";

import { getSourceRegistry } from "../sourceRegistry.js";

function mockRegionalSignals(sourceMetadata) {
  return {
    areas: {
      parramatta: {
        area: { id: "parramatta", name: "Parramatta, NSW" },
        ingestionHealth: { overallStatus: "partial" },
        sourceMetadata,
      },
    },
  };
}

test("source registry exposes professional reliability fields for live gauge sources", () => {
  const registry = getSourceRegistry(
    mockRegionalSignals([
      {
        label: "FloodSmart rainfall",
        type: "rainfall",
        source: "https://example.test/rainfall",
        sourceStrength: "primary_live_gauge",
        fetchedAt: "2026-06-29T03:00:00Z",
        observedAt: "2026-06-29T02:55:00Z",
        freshnessStatus: "current",
        dataMode: "live",
        areaRelevance: ["67111"],
        note: "Rainfall gauge is current.",
      },
    ]),
  );

  const source = registry.areas[0].sources[0];
  assert.equal(source.sourceName, "FloodSmart rainfall");
  assert.equal(source.sourceOwner, "City of Parramatta");
  assert.equal(source.sourceStrength, "primary_live_gauge");
  assert.equal(source.sourceType, "rainfall");
  assert.equal(source.isOfficial, false);
  assert.equal(source.isQualityControlled, true);
  assert.equal(source.lastFetchedAt, "2026-06-29T03:00:00Z");
  assert.equal(source.latestObservedAt, "2026-06-29T02:55:00Z");
  assert.equal(source.freshnessStatus, "current");
});

test("source registry marks derived proxy, warning, and stale cases clearly", () => {
  const registry = getSourceRegistry(
    mockRegionalSignals([
      {
        label: "BoM Parramatta rain trace observations",
        type: "rainfall",
        source: "https://example.test/weather-proxy",
        sourceStrength: "weather_proxy",
        fetchedAt: "2026-06-29T03:00:00Z",
        observedAt: null,
        freshnessStatus: "unknown",
        dataMode: "derived_proxy",
        note: "Proxy rainfall only.",
      },
      {
        label: "NSW SES / HazardWatch warning status",
        type: "warnings",
        source: "https://www.hazardwatch.gov.au/",
        sourceStrength: "official_warning",
        fetchedAt: "2026-06-29T03:00:00Z",
        observedAt: "2026-06-29T02:40:00Z",
        freshnessStatus: "stale",
        dataMode: "live",
        note: "Official warning feed is stale.",
      },
    ]),
  );

  const [proxySource, warningSource] = registry.areas[0].sources;
  assert.equal(proxySource.sourceStrength, "weather_proxy");
  assert.ok(proxySource.limitations.some((note) => /proxied/i.test(note)));
  assert.equal(proxySource.freshnessStatus, "unknown");
  assert.equal(warningSource.sourceStrength, "official_warning");
  assert.equal(warningSource.sourceType, "warning");
  assert.equal(warningSource.isOfficial, true);
  assert.equal(warningSource.freshnessStatus, "stale");
  assert.ok(warningSource.qualityNotes.some((note) => /stale/i.test(note)));
});

test("source registry exposes the default HazardWatch warning adapter as active ingestion", () => {
  const registry = getSourceRegistry();

  assert.equal(registry.activeIngestion.warnings.label, "NSW SES / HazardWatch warning status");
  assert.equal(registry.activeIngestion.warnings.sourceStrength, "official_warning");
  assert.equal(registry.activeIngestion.warnings.optional, true);
  assert.equal(registry.activeIngestion.warnings.url, "https://www.hazardwatch.gov.au/");
});
