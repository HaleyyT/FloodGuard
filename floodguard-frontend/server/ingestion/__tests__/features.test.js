import assert from "node:assert/strict";
import test from "node:test";

import { buildRiskSignals } from "../riskEngine.js";

function baseSignals(overrides = {}) {
  return {
    weatherObservations: {
      stationName: "Parramatta",
      rainfallTraceMm: 0,
      cloudOktas: 3,
      cloudBaseM: 800,
      visibilityKm: 20,
    },
    rainfallSeries: {
      latestValidRainfallMm: 0,
      points: [],
    },
    riverContext: {
      issuedDate: "2026-06-29T03:00:00Z",
      primaryStation: null,
      stations: [],
    },
    sourceMetadata: [
      {
        label: "FloodSmart rainfall",
        type: "rainfall",
        mode: "remote",
        dataMode: "live",
        freshnessStatus: "current",
        sourceStrength: "primary_live_gauge",
        status: "ok",
      },
      {
        label: "FloodSmart river",
        type: "river",
        mode: "remote",
        dataMode: "live",
        freshnessStatus: "current",
        sourceStrength: "primary_live_gauge",
        status: "ok",
      },
      {
        label: "BoM weather",
        type: "weather",
        mode: "remote",
        dataMode: "live",
        freshnessStatus: "current",
        sourceStrength: "official_backup",
        status: "ok",
      },
    ],
    freshness: {
      fallbackSourceCount: 0,
      failedSourceCount: 0,
      staleSourceCount: 0,
    },
    dataQuality: { coverageScore: 100 },
    areaRelevance: { score: 100 },
    publicSignalSummary: { publicSignalPressure: 0, actionableReports: 0 },
    ...overrides,
  };
}

test("calculates rainfall windows with boundary-aware rolling totals", () => {
  const signals = baseSignals({
    rainfallSeries: {
      latestValidRainfallMm: 4,
      points: [
        { time: "2026-06-26T03:00:00Z", rainfallMm: 3 },
        { time: "2026-06-28T23:59:00Z", rainfallMm: 2 },
        { time: "2026-06-29T01:00:00Z", rainfallMm: 1 },
        { time: "2026-06-29T02:00:00Z", rainfallMm: 4 },
      ],
    },
  });

  const features = buildRiskSignals(signals).features;

  assert.equal(features.rainfall1hMm, 5);
  assert.equal(features.rainfall3hMm, 7);
  assert.equal(features.rainfall24hMm, 7);
  assert.equal(features.rainfall72hMm, 10);
});

test("calculates river deltas and rising trend from recent points", () => {
  const riverPoints = [
    { time: "2026-06-29T00:00:00Z", heightM: 1.0 },
    { time: "2026-06-29T01:00:00Z", heightM: 1.12 },
    { time: "2026-06-29T03:00:00Z", heightM: 1.34 },
  ];
  const station = {
    stationName: "Parramatta River at Riverside Theatre",
    heightM: 1.34,
    tendency: "rising",
    previousHeightM: 1.12,
    points: riverPoints,
  };

  const features = buildRiskSignals(
    baseSignals({
      riverContext: {
        issuedDate: "2026-06-29T03:00:00Z",
        primaryStation: station,
        stations: [station],
      },
    }),
  ).features;

  assert.equal(features.riverLatestM, 1.3);
  assert.equal(features.riverDelta1hM, 0.22);
  assert.equal(features.riverDelta3hM, 0.34);
  assert.equal(features.riverTrend, "rising");
});

test("reports freshness score and source coverage separately for degraded inputs", () => {
  const signals = baseSignals({
    sourceMetadata: [
      {
        label: "FloodSmart rainfall",
        type: "rainfall",
        mode: "cached_recent",
        dataMode: "cached_recent",
        freshnessStatus: "current",
        sourceStrength: "primary_live_gauge",
        status: "ok",
      },
      {
        label: "FloodSmart river",
        type: "river",
        mode: "remote",
        dataMode: "live",
        freshnessStatus: "current",
        sourceStrength: "primary_live_gauge",
        status: "ok",
      },
      {
        label: "BoM weather",
        type: "weather",
        mode: "remote",
        dataMode: "live",
        freshnessStatus: "stale",
        sourceStrength: "official_backup",
        status: "ok",
        ageHours: 18,
      },
    ],
    freshness: {
      fallbackSourceCount: 0,
      failedSourceCount: 0,
      staleSourceCount: 1,
    },
    dataQuality: { coverageScore: 67 },
  });

  const features = buildRiskSignals(signals).features;

  assert.equal(features.sourceCoverage, 0.67);
  assert.ok(features.freshnessScore < 1);
  assert.ok(features.dataFreshnessScore < 100);
});
