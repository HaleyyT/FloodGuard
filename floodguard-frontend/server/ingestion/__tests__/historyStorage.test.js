import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { appendAreaHistory, buildAreaHistoryRecord, readAreaHistory } from "../store.js";

function mockAreaSignals(overrides = {}) {
  return {
    area: {
      id: "parramatta",
      name: "Parramatta, NSW",
      catchment: "Parramatta River",
    },
    ingestedAt: "2026-06-29T03:00:00.000Z",
    weatherObservations: {
      stationName: "Parramatta North",
      rainfallTraceMm: 0.6,
    },
    rainfallSeries: {
      latestValidRainfallMm: 12.4,
      stationNumber: "67111",
      stationName: "North Parramatta",
      sourceLabel: "FloodSmart rainfall",
      aggregation: "5 minute",
      points: [{ time: "2026-06-29T02:55:00.000Z", rainfallMm: 12.4 }],
    },
    riverContext: {
      stationCount: 1,
      issuedDate: "2026-06-29T02:50:00.000Z",
      tendencyCounts: { rising: 1, steady: 0, falling: 0 },
      primaryStation: {
        stationName: "Parramatta River at Riverside Theatre",
        heightM: 1.83,
        tendency: "Rising",
      },
    },
    warningSummary: {
      status: "no_current_warning",
      statusLabel: "No current warning",
      observedAt: null,
      warningCount: 0,
      warnings: [],
    },
    riskAssessment: {
      concernLevel: "Moderate",
      score: 58,
      signals: {},
      features: {},
      decisionAudit: { reliability: { score: 84, level: "High" } },
    },
    publicSignalSummary: {},
    spatialRelevance: {},
    dataQuality: {},
    freshness: {},
    areaRelevance: {},
    sourceMetadata: [
      {
        label: "FloodSmart rainfall",
        type: "rainfall",
        mode: "remote",
        dataMode: "live",
        observedAt: "2026-06-29T02:55:00.000Z",
        fetchedAt: "2026-06-29T03:00:00.000Z",
        freshnessStatus: "current",
        sourceStrength: "primary_live_gauge",
        source: "https://example.test/rainfall",
      },
      {
        label: "FloodSmart river",
        type: "river",
        mode: "remote",
        dataMode: "live",
        observedAt: "2026-06-29T02:50:00.000Z",
        fetchedAt: "2026-06-29T03:00:00.000Z",
        freshnessStatus: "current",
        sourceStrength: "primary_live_gauge",
        source: "https://example.test/river",
      },
    ],
    ...overrides,
  };
}

test("history record preserves reading metadata for stored source snapshots", () => {
  const record = buildAreaHistoryRecord(mockAreaSignals());

  assert.equal(record.sourceReadings[0].stationId, "67111");
  assert.equal(record.sourceReadings[0].signalType, "rainfall");
  assert.equal(record.sourceReadings[0].value, 12.4);
  assert.equal(record.sourceReadings[0].sourceStrength, "primary_live_gauge");
  assert.equal(record.sourceReadings[0].dataMode, "live");
});

test("appendAreaHistory deduplicates identical snapshots", async () => {
  const historyDir = await mkdtemp(path.join(os.tmpdir(), "floodguard-history-"));

  try {
    await appendAreaHistory(historyDir, mockAreaSignals());
    await appendAreaHistory(historyDir, mockAreaSignals());

    const history = await readAreaHistory(historyDir, "parramatta", 10);
    assert.equal(history.length, 1);
  } finally {
    await rm(historyDir, { force: true, recursive: true });
  }
});

test("readAreaHistory filters to the requested rolling time window", async () => {
  const historyDir = await mkdtemp(path.join(os.tmpdir(), "floodguard-history-"));
  const now = Date.now();

  try {
    await appendAreaHistory(
      historyDir,
      mockAreaSignals({ ingestedAt: new Date(now - 80 * 60 * 60 * 1000).toISOString() }),
    );
    await appendAreaHistory(
      historyDir,
      mockAreaSignals({ ingestedAt: new Date(now - 30 * 60 * 60 * 1000).toISOString() }),
    );
    await appendAreaHistory(
      historyDir,
      mockAreaSignals({ ingestedAt: new Date(now - 2 * 60 * 60 * 1000).toISOString() }),
    );

    const recentHistory = await readAreaHistory(historyDir, "parramatta", {
      limit: 10,
      sinceHours: 72,
    });

    assert.equal(recentHistory.length, 2);
    assert.ok(recentHistory.every((entry) => new Date(entry.ingestedAt).getTime() >= now - 72 * 60 * 60 * 1000));
  } finally {
    await rm(historyDir, { force: true, recursive: true });
  }
});
