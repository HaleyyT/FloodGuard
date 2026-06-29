import assert from "node:assert/strict";
import test from "node:test";

import { buildAreaIngestionHealth } from "../health.js";

function createAreaSignals(sourceMetadata) {
  return {
    area: { id: "parramatta", name: "Parramatta, NSW" },
    sourceMetadata,
    dataQuality: { missing: [], coverageScore: 100 },
    freshness: { status: "ok", staleSourceCount: 0, fallbackSourceCount: 0, failedSourceCount: 0 },
    areaRelevance: {
      score: 100,
      matchedSignals: 5,
      expectedSignals: 5,
      missingRiverStations: [],
    },
  };
}

test("reports partial overall status when gauges are current but weather is stale and warnings are missing", () => {
  const areaSignals = createAreaSignals([
    {
      label: "Parramatta weather observations",
      type: "weather",
      mode: "remote",
      dataMode: "live",
      sourceStrength: "official_backup",
      status: "ok",
      freshnessStatus: "stale",
      ageHours: 18,
      staleAfterHours: 12,
    },
    {
      label: "FloodSmart rainfall",
      type: "rainfall",
      mode: "remote",
      dataMode: "live",
      sourceStrength: "primary_live_gauge",
      status: "ok",
      freshnessStatus: "current",
      ageHours: 0.2,
      staleAfterHours: 6,
    },
    {
      label: "FloodSmart river",
      type: "river",
      mode: "remote",
      dataMode: "live",
      sourceStrength: "primary_live_gauge",
      status: "ok",
      freshnessStatus: "current",
      ageHours: 0.2,
      staleAfterHours: 6,
    },
    {
      label: "NSW SES / HazardWatch warning status",
      type: "warnings",
      mode: "not-configured",
      dataMode: "missing",
      sourceStrength: "official_warning",
      status: "not-connected",
      freshnessStatus: "missing",
      ageHours: null,
      staleAfterHours: 1,
    },
  ]);

  const health = buildAreaIngestionHealth(areaSignals);

  assert.equal(health.coreFloodStatus, "pass");
  assert.equal(health.contextStatus, "warn");
  assert.equal(health.warningStatus, "missing");
  assert.equal(health.overallStatus, "partial");
});

test("blocks core flood status when rainfall is stale or fallback", () => {
  const areaSignals = createAreaSignals([
    {
      label: "FloodSmart rainfall",
      type: "rainfall",
      mode: "local_demo_fallback",
      dataMode: "local_demo_fallback",
      sourceStrength: "local_fallback",
      status: "ok",
      freshnessStatus: "stale",
      ageHours: 9,
      staleAfterHours: 6,
    },
    {
      label: "FloodSmart river",
      type: "river",
      mode: "remote",
      dataMode: "live",
      sourceStrength: "primary_live_gauge",
      status: "ok",
      freshnessStatus: "current",
      ageHours: 0.1,
      staleAfterHours: 6,
    },
  ]);

  const health = buildAreaIngestionHealth(areaSignals);

  assert.equal(health.coreFloodStatus, "blocked");
  assert.equal(health.overallStatus, "blocked");
  assert.match(health.blockers.join(" "), /local demo fallback|stale/i);
});
