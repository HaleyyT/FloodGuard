import assert from "node:assert/strict";
import test from "node:test";

import { routeRequest } from "../../server.js";

function areaSignals(area) {
  return {
    area,
    location: { name: area.name },
    ingestedAt: "2026-06-30T02:00:00Z",
    weatherObservations: { stationName: "Parramatta", observedAt: "2026-06-30T01:50:00Z" },
    rainfallSeries: {
      latestValidRainfallMm: area.id === "toongabbie" ? 7 : 4,
      points: [{ time: "2026-06-30T01:55:00Z", rainfallMm: area.id === "toongabbie" ? 7 : 4 }],
    },
    riverContext: {
      stationCount: 1,
      primaryStation: { stationName: "Local Creek", heightM: 1.2 },
      stations: [{ stationName: "Local Creek", heightM: 1.2 }],
    },
    sourceMetadata: [
      {
        label: "FloodSmart rainfall",
        type: "rainfall",
        mode: "remote",
        dataMode: "live",
        freshnessStatus: "current",
        sourceStrength: "primary_live_gauge",
        fetchedAt: "2026-06-30T02:00:00Z",
        observedAt: "2026-06-30T01:55:00Z",
      },
      {
        label: "FloodSmart river",
        type: "river",
        mode: "remote",
        dataMode: "live",
        freshnessStatus: "current",
        sourceStrength: "primary_live_gauge",
        fetchedAt: "2026-06-30T02:00:00Z",
        observedAt: "2026-06-30T01:55:00Z",
      },
    ],
    freshness: { staleSourceCount: 0, fallbackSourceCount: 0, failedSourceCount: 0 },
    dataQuality: { missing: [], coverageScore: 100 },
    riskAssessment: {
      concernLevel: area.id === "toongabbie" ? "Moderate" : "Low",
      score: area.id === "toongabbie" ? 52 : 24,
      features: { rainfall1hMm: area.id === "toongabbie" ? 7 : 4, rainfall3hMm: 10, riverDelta1hM: 0.04, riverDelta3hM: 0.08 },
      pressureScores: { rainfallPressure: 0.45, riverPressure: 0.25, wetnessPressure: 0.2, trendPressure: 0.1, confidence: 0.9 },
      excludedSignals: [],
      decisionAudit: { reliability: { score: 90, level: "High", blockers: [], warnings: [] } },
      notificationEligibility: { notificationType: area.id === "toongabbie" ? "awareness_notice" : "none" },
    },
    ingestionHealth: {
      overallStatus: "live",
      coreFloodStatus: "pass",
      contextStatus: "pass",
      warningStatus: "missing",
    },
  };
}

async function requestJson(path, deps) {
  const responseState = { statusCode: null, body: "" };
  const request = {
    method: "GET",
    url: path,
    headers: { host: "127.0.0.1:5174" },
    socket: { remoteAddress: "127.0.0.1" },
    on() {},
  };
  const response = {
    writeHead(statusCode) {
      responseState.statusCode = statusCode;
    },
    end(body) {
      responseState.body = body;
    },
  };

  await routeRequest(request, response, deps);
  return { statusCode: responseState.statusCode, body: JSON.parse(responseState.body) };
}

function dependencies() {
  const areas = [
    { id: "parramatta", name: "Parramatta, NSW", catchment: "Parramatta River" },
    { id: "north-parramatta", name: "North Parramatta, NSW", catchment: "Darling Mills Creek / Parramatta River" },
    { id: "toongabbie", name: "Toongabbie, NSW", catchment: "Toongabbie Creek" },
  ];
  const regionalSignals = {
    defaultAreaId: "parramatta",
    ingestedAt: "2026-06-30T02:00:00Z",
    refreshMetadata: { status: "refreshed", servedAt: "2026-06-30T02:00:02Z" },
    areaList: areas,
    areas: Object.fromEntries(areas.map((area) => [area.id, areaSignals(area)])),
  };

  return {
    readGaugeMetadata: async () => ({ generatedAt: regionalSignals.ingestedAt }),
    readOrRefreshRegionalSignals: async () => regionalSignals,
    runRegionalIngestion: async () => regionalSignals,
    selectAreaSignals: (signals, areaId) => signals.areas[areaId] ?? null,
    getSourceRegistry: () => ({ generatedAt: regionalSignals.ingestedAt, areas: [] }),
    buildRegionalIngestionHealth: () => ({
      status: "ready",
      overallStatus: "live",
      coreFloodStatus: "pass",
      contextStatus: "pass",
      warningStatus: "missing",
      ready: true,
      blockedAreaCount: 0,
      warningAreaCount: 3,
      summary: "Core flood gauges are current.",
      areas: areas.map((area) => ({ areaId: area.id, sources: regionalSignals.areas[area.id].sourceMetadata })),
    }),
    readAreaNotifications: async (signals) => ({
      areaId: signals.area.id,
      generatedAt: signals.ingestedAt,
      candidates: [],
      suppressed: [],
    }),
    readAreaWarningStatus: () => ({ area: "Parramatta, NSW", hasWarning: false, adapterStatus: "not_configured", sourceName: "NSW SES HazardWatch", sourceUrl: "https://www.hazardwatch.gov.au/" }),
    readAreaMlReadiness: async () => ({ areaId: "parramatta", readyForTraining: false }),
  };
}

test("smoke contracts load all pilot areas and area signal payloads", async () => {
  const deps = dependencies();
  const areasResponse = await requestJson("/api/areas", deps);
  const parramattaResponse = await requestJson("/api/signals/parramatta", deps);
  const northResponse = await requestJson("/api/signals/north-parramatta", deps);
  const toongabbieResponse = await requestJson("/api/signals/toongabbie", deps);

  assert.equal(areasResponse.body.length, 3);
  assert.equal(parramattaResponse.body.area.id, "parramatta");
  assert.equal(northResponse.body.area.id, "north-parramatta");
  assert.equal(toongabbieResponse.body.area.id, "toongabbie");
});

test("smoke contracts expose notification preview without crashing", async () => {
  const deps = dependencies();
  const response = await requestJson("/api/notifications/preview/toongabbie", deps);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.areaId, "toongabbie");
  assert.ok(Array.isArray(response.body.candidates));
});
