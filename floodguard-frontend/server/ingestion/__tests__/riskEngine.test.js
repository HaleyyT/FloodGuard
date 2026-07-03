import assert from "node:assert/strict";
import test from "node:test";

import { assessRisk } from "../riskEngine.js";

function buildSignals({
  rainfallPoints = [],
  riverStations = [],
  weather = {},
  sourceMetadata = [],
  publicSignalSummary = {},
} = {}) {
  return {
    area: { id: "parramatta", name: "Parramatta, NSW", catchment: "Parramatta River" },
    weatherObservations: {
      stationName: "Parramatta",
      rainfallTraceMm: 0,
      cloudOktas: 2,
      cloudBaseM: 800,
      visibilityKm: 20,
      ...weather,
    },
    rainfallSeries: {
      latestValidRainfallMm: rainfallPoints.at(-1)?.rainfallMm ?? 0,
      points: rainfallPoints,
    },
    riverContext: {
      issuedDate: riverStations.at(0)?.points?.[0]?.time ?? "2026-06-29T01:00:00Z",
      primaryStation: riverStations[0] ?? null,
      stations: riverStations,
    },
    sourceMetadata,
    freshness: {
      fallbackSourceCount: sourceMetadata.filter((source) =>
        ["local_demo_fallback", "local-fallback"].includes(source.dataMode ?? source.mode),
      ).length,
      failedSourceCount: sourceMetadata.filter((source) => source.status === "failed").length,
      staleSourceCount: sourceMetadata.filter((source) => source.freshnessStatus === "stale").length,
    },
    dataQuality: { coverageScore: 100, missing: [] },
    areaRelevance: { score: 100 },
    publicSignalSummary: {
      actionableReports: 0,
      publicSignalPressure: 0,
      ...publicSignalSummary,
    },
  };
}

function liveSources() {
  return [
    {
      label: "FloodSmart rainfall",
      type: "rainfall",
      mode: "remote",
      dataMode: "live",
      sourceStrength: "primary_live_gauge",
      freshnessStatus: "current",
      status: "ok",
    },
    {
      label: "FloodSmart river",
      type: "river",
      mode: "remote",
      dataMode: "live",
      sourceStrength: "primary_live_gauge",
      freshnessStatus: "current",
      status: "ok",
    },
    {
      label: "Parramatta weather observations",
      type: "weather",
      mode: "remote",
      dataMode: "live",
      sourceStrength: "official_backup",
      freshnessStatus: "current",
      status: "ok",
    },
  ];
}

test("produces low risk for low rainfall and steady river conditions", () => {
  const result = assessRisk(
    buildSignals({
      rainfallPoints: [{ time: "2026-06-29T00:45:00Z", rainfallMm: 0.2 }],
      riverStations: [
        {
          stationName: "Parramatta River at Riverside Theatre",
          heightM: 1.2,
          tendency: "steady",
          previousHeightM: 1.2,
          points: [
            { time: "2026-06-29T00:45:00Z", heightM: 1.2 },
            { time: "2026-06-29T00:30:00Z", heightM: 1.2 },
          ],
        },
      ],
      sourceMetadata: liveSources(),
    }),
  );

  assert.equal(result.concernLevel, "Low");
  assert.ok(result.signals.confidence >= 80);
});

test("produces moderate risk when short-window rainfall is elevated", () => {
  const result = assessRisk(
    buildSignals({
      rainfallPoints: [
        { time: "2026-06-28T23:30:00Z", rainfallMm: 2.2 },
        { time: "2026-06-29T00:10:00Z", rainfallMm: 2.1 },
        { time: "2026-06-29T00:50:00Z", rainfallMm: 1.7 },
      ],
      riverStations: [
        {
          stationName: "Parramatta River at Riverside Theatre",
          heightM: 1.4,
          tendency: "steady",
          previousHeightM: 1.4,
          points: [
            { time: "2026-06-29T00:50:00Z", heightM: 1.4 },
            { time: "2026-06-29T00:20:00Z", heightM: 1.4 },
          ],
        },
      ],
      sourceMetadata: liveSources(),
    }),
  );

  assert.equal(result.concernLevel, "Moderate");
  assert.ok(result.signals.rainfallPressure > result.signals.riverPressure);
  assert.match(result.reasons.join(" "), /3h window|24h window/i);
  assert.equal(result.decisionAudit.hazardPressure.rainfall, "watch");
  assert.equal(result.decisionAudit.hazardPressure.river, "stable");
  assert.equal(result.decisionAudit.evidenceConfidence, "high");
  assert.equal(result.decisionAudit.recommendationType, "monitor_and_check_official_sources");
  assert.ok(result.decisionAudit.whatIncreasedConcern.length > 0);
  assert.ok(result.decisionAudit.whatReducedConcern.length > 0);
  assert.ok(result.decisionAudit.checkNext.some((step) => /NSW SES|BoM/i.test(step)));
});

test("produces high risk when heavy rain, wetness, and rising river combine", () => {
  const result = assessRisk(
    buildSignals({
      rainfallPoints: [
        { time: "2026-06-26T00:00:00Z", rainfallMm: 6 },
        { time: "2026-06-28T23:00:00Z", rainfallMm: 5 },
        { time: "2026-06-29T00:00:00Z", rainfallMm: 8 },
        { time: "2026-06-29T00:40:00Z", rainfallMm: 9 },
      ],
      riverStations: [
        {
          stationName: "Parramatta River at Riverside Theatre",
          heightM: 2.4,
          tendency: "rising",
          previousHeightM: 1.9,
          points: [
            { time: "2026-06-29T00:40:00Z", heightM: 2.4 },
            { time: "2026-06-29T00:10:00Z", heightM: 2.1 },
            { time: "2026-06-28T23:40:00Z", heightM: 1.9 },
          ],
        },
      ],
      sourceMetadata: liveSources(),
    }),
  );

  assert.equal(result.concernLevel, "High");
  assert.ok(result.signals.confidence >= 80);
});

test("excludes stale or fallback core sources from live scoring", () => {
  const metadata = liveSources();
  metadata[0] = {
    ...metadata[0],
    dataMode: "local_demo_fallback",
    mode: "local_demo_fallback",
    sourceStrength: "local_fallback",
    freshnessStatus: "stale",
  };

  const result = assessRisk(
    buildSignals({
      rainfallPoints: [
        { time: "2026-06-28T23:30:00Z", rainfallMm: 6 },
        { time: "2026-06-29T00:30:00Z", rainfallMm: 7 },
      ],
      riverStations: [
        {
          stationName: "Parramatta River at Riverside Theatre",
          heightM: 1.4,
          tendency: "steady",
          previousHeightM: 1.4,
          points: [
            { time: "2026-06-29T00:30:00Z", heightM: 1.4 },
            { time: "2026-06-29T00:00:00Z", heightM: 1.4 },
          ],
        },
      ],
      sourceMetadata: metadata,
    }),
  );

  assert.equal(result.signals.rainfallPressure, 0);
  assert.ok(result.excludedSignals.length > 0);
  assert.match(result.excludedSignals[0], /excluded from live core scoring/i);
  assert.equal(result.decisionAudit.evidenceConfidence, "partial");
  assert.ok(result.decisionAudit.sourceLimitations.some((item) => /fallback|stale/i.test(item)));
});
