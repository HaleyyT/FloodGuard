import assert from "node:assert/strict";
import test from "node:test";

import { buildSpatialRelevance, resolveSpatialQuery } from "../spatialRelevance.js";
import { getAreaConfig } from "../areaConfig.js";

test("spatial relevance returns selected stations by type and a PostGIS migration plan", () => {
  const spatial = buildSpatialRelevance(getAreaConfig("parramatta"));

  assert.equal(spatial.selectionPolicy, "configured-area-first-then-nearest-context");
  assert.equal(spatial.selectedStations.rainfall[0].stationId, "67111");
  assert.equal(spatial.primaryStationsByType.river.stationName, "Parramatta River at Marsden Weir");
  assert.equal(spatial.postgisMigrationPlan.status, "planned");
});

test("spatial query resolves nearest area from coordinates and keeps structured gauge metadata", () => {
  const result = resolveSpatialQuery({ lat: -33.79, lon: 150.95 });

  assert.equal(result.resolvedArea.id, "toongabbie");
  assert.equal(result.spatialRelevance.primaryStationsByType.rainfall.stationId, "567065");
  assert.equal(result.spatialRelevance.primaryStationsByType.rainfall.sourceType, "primary_live_gauge");
});
