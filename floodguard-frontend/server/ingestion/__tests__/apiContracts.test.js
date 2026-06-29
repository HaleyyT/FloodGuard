import assert from "node:assert/strict";
import test from "node:test";

import { routeRequest } from "../../server.js";

function mockRegionalSignals() {
  const areaSignals = {
    area: { id: "parramatta", name: "Parramatta, NSW" },
    ingestedAt: "2026-06-29T03:00:00Z",
    sourceMetadata: [
      {
        label: "FloodSmart rainfall",
        type: "rainfall",
        mode: "remote",
        dataMode: "live_summary_fallback",
        freshnessStatus: "current",
        sourceStrength: "primary_live_gauge",
        fetchedAt: "2026-06-29T03:00:00Z",
        observedAt: "2026-06-29T02:55:00Z",
      },
      {
        label: "FloodSmart river",
        type: "river",
        mode: "cached_recent",
        dataMode: "cached_recent",
        freshnessStatus: "current",
        sourceStrength: "primary_live_gauge",
        fetchedAt: "2026-06-29T03:00:00Z",
        observedAt: "2026-06-29T02:40:00Z",
      },
    ],
    freshness: { staleSourceCount: 0, fallbackSourceCount: 0, failedSourceCount: 0 },
    dataQuality: { missing: [], coverageScore: 100 },
    riskAssessment: {
      concernLevel: "Moderate",
      score: 52,
      features: {
        rainfall1hMm: 5,
        rainfall3hMm: 8,
        riverDelta1hM: 0.11,
        riverDelta3hM: 0.21,
      },
      pressureScores: {
        rainfallPressure: 0.52,
        riverPressure: 0.44,
        wetnessPressure: 0.33,
        trendPressure: 0.21,
        confidence: 0.82,
      },
      excludedSignals: [],
      decisionAudit: {
        reliability: { score: 82, level: "High" },
      },
    },
    ingestionHealth: {
      overallStatus: "partial",
      coreFloodStatus: "warn",
      contextStatus: "pass",
      warningStatus: "missing",
    },
  };

  return {
    defaultAreaId: "parramatta",
    ingestedAt: "2026-06-29T03:00:00Z",
    refreshMetadata: { status: "refreshed", servedAt: "2026-06-29T03:00:01Z" },
    areaList: [{ id: "parramatta", name: "Parramatta, NSW" }],
    areas: { parramatta: areaSignals },
  };
}

async function requestJson(path, deps) {
  const responseState = { statusCode: null, headers: null, body: "" };
  const request = {
    method: "GET",
    url: path,
    headers: { host: "127.0.0.1:5174" },
    socket: { remoteAddress: "127.0.0.1" },
    on() {},
  };
  const response = {
    writeHead(statusCode, headers) {
      responseState.statusCode = statusCode;
      responseState.headers = headers;
    },
    end(body) {
      responseState.body = body;
    },
  };

  await routeRequest(request, response, deps);
  return {
    statusCode: responseState.statusCode,
    body: JSON.parse(responseState.body),
  };
}

function dependencies() {
  const regionalSignals = mockRegionalSignals();
  return {
    readGaugeMetadata: async () => ({ generatedAt: regionalSignals.ingestedAt }),
    readOrRefreshRegionalSignals: async () => regionalSignals,
    runRegionalIngestion: async () => regionalSignals,
    selectAreaSignals: (signals, areaId) => signals.areas[areaId] ?? null,
    getSourceRegistry: () => ({
      generatedAt: regionalSignals.ingestedAt,
      areas: [
        {
          area: "parramatta",
          areaName: "Parramatta, NSW",
          sources: regionalSignals.areas.parramatta.sourceMetadata,
        },
      ],
    }),
    buildRegionalIngestionHealth: () => ({
      status: "warning",
      overallStatus: "partial",
      coreFloodStatus: "warn",
      contextStatus: "pass",
      warningStatus: "missing",
      ready: true,
      blockedAreaCount: 0,
      warningAreaCount: 1,
      summary: "Core flood awareness is running on degraded but usable evidence.",
      areas: [
        {
          areaId: "parramatta",
          sources: regionalSignals.areas.parramatta.sourceMetadata,
        },
      ],
    }),
    readAreaNotifications: async () => ({
      areaId: "parramatta",
      generatedAt: regionalSignals.ingestedAt,
      candidates: [
        {
          id: "parramatta-data_reliability_degraded",
          type: "data_reliability_degraded",
          severity: "info",
        },
      ],
    }),
    readAreaMlReadiness: async () => ({
      areaId: "parramatta",
      rows: 24,
      labelSource: "rule_derived",
      hasIndependentLabels: false,
      readyForTraining: false,
      reason: "Insufficient reliable history for training or comparison.",
    }),
  };
}

test("health endpoint exposes layered statuses and core data modes", async () => {
  const { body } = await requestJson("/api/health", dependencies());
  assert.equal(body.ingestionHealth.overallStatus, "partial");
  assert.equal(body.ingestionHealth.coreFloodStatus, "warn");
  assert.equal(body.ingestionHealth.coreDataModes.parramatta[0].dataMode, "live_summary_fallback");
});

test("risk endpoint returns features, pressure scores, and excluded signals contract", async () => {
  const { body } = await requestJson("/api/risk/parramatta", dependencies());
  assert.equal(body.concernLevel, "Moderate");
  assert.equal(typeof body.features.rainfall1hMm, "number");
  assert.equal(typeof body.pressureScores.rainfallPressure, "number");
  assert.ok(Array.isArray(body.excludedSignals));
});

test("source registry endpoint exposes source evidence and data modes per area", async () => {
  const { body } = await requestJson("/api/source-registry", dependencies());
  assert.equal(body.areas[0].area, "parramatta");
  assert.equal(body.areas[0].sources[1].dataMode, "cached_recent");
});

test("notifications endpoint returns current notification candidates", async () => {
  const { body } = await requestJson("/api/notifications/parramatta", dependencies());
  assert.equal(body.areaId, "parramatta");
  assert.equal(body.candidates[0].type, "data_reliability_degraded");
});

test("ml readiness endpoint reports honest training readiness state", async () => {
  const { body } = await requestJson("/api/ml/readiness/parramatta", dependencies());
  assert.equal(body.areaId, "parramatta");
  assert.equal(body.labelSource, "rule_derived");
  assert.equal(body.hasIndependentLabels, false);
  assert.equal(body.readyForTraining, false);
});
