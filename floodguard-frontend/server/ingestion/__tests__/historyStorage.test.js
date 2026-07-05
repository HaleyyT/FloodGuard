import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  appendAreaHistory,
  buildAreaHistoryRecord,
  readAreaHistory,
  summariseAreaHistoryWindow,
} from "../store.js";

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
      decisionAudit: {
        reliability: { score: 84, level: "High" },
        hazardPressure: { rainfall: "watch", river: "stable", wetness: "low" },
        evidenceConfidence: "high",
        officialWarningContext: "no_current_warning",
        recommendationType: "monitor_and_check_official_sources",
        decisionRecommendation: {
          note: "Conditions warrant monitoring and checking official sources.",
        },
        whatIncreasedConcern: ["Short-window rainfall is elevated."],
        whatReducedConcern: ["River trend is stable."],
        excludedEvidence: ["Weather context was excluded because it is stale."],
        sourceLimitations: ["Official warning feed is not connected yet."],
        checkNext: ["Check official NSW SES and BoM advice."],
      },
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
  assert.equal(record.decisionAuditSnapshot.hazardPressure.rainfall, "watch");
  assert.equal(record.decisionAuditSnapshot.evidenceConfidence, "high");
  assert.ok(record.decisionAuditSnapshot.checkNext[0].includes("NSW SES"));
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

test("readAreaHistory filters to an explicit event-style start and end window", async () => {
  const historyDir = await mkdtemp(path.join(os.tmpdir(), "floodguard-history-"));

  try {
    await appendAreaHistory(
      historyDir,
      mockAreaSignals({ ingestedAt: "2026-06-29T01:00:00.000Z" }),
    );
    await appendAreaHistory(
      historyDir,
      mockAreaSignals({ ingestedAt: "2026-06-29T03:00:00.000Z" }),
    );
    await appendAreaHistory(
      historyDir,
      mockAreaSignals({ ingestedAt: "2026-06-29T05:00:00.000Z" }),
    );

    const windowedHistory = await readAreaHistory(historyDir, "parramatta", {
      limit: 10,
      startTime: "2026-06-29T02:00:00.000Z",
      endTime: "2026-06-29T04:00:00.000Z",
    });

    assert.equal(windowedHistory.length, 1);
    assert.equal(windowedHistory[0].ingestedAt, "2026-06-29T03:00:00.000Z");
  } finally {
    await rm(historyDir, { force: true, recursive: true });
  }
});

test("summariseAreaHistoryWindow reports degraded coverage and latest decision state", () => {
  const currentRecord = buildAreaHistoryRecord(mockAreaSignals());
  const degradedRecord = buildAreaHistoryRecord(
    mockAreaSignals({
      ingestedAt: "2026-06-29T02:00:00.000Z",
      riskAssessment: {
        concernLevel: "Low",
        score: 18,
        signals: {},
        features: {},
        decisionAudit: {
          reliability: { score: 71, level: "Medium" },
          officialWarningContext: "warning_source_unavailable",
        },
      },
      sourceMetadata: [
        {
          label: "FloodSmart rainfall",
          type: "rainfall",
          mode: "remote",
          dataMode: "cached_stale",
          observedAt: "2026-06-29T01:00:00.000Z",
          fetchedAt: "2026-06-29T02:00:00.000Z",
          freshnessStatus: "stale",
          sourceStrength: "primary_live_gauge",
          source: "https://example.test/rainfall",
        },
      ],
    }),
  );

  const summary = summariseAreaHistoryWindow(
    "parramatta",
    [currentRecord, degradedRecord],
    { limit: 10, startTime: "2026-06-29T01:00:00.000Z", endTime: "2026-06-29T03:00:00.000Z" },
  );

  assert.equal(summary.recordCount, 2);
  assert.equal(summary.riskLevelCounts.Moderate, 1);
  assert.equal(summary.riskLevelCounts.Low, 1);
  assert.equal(summary.warningContextCounts.no_current_warning, 1);
  assert.equal(summary.warningContextCounts.warning_source_unavailable, 1);
  assert.equal(summary.degradedRecordCount, 1);
  assert.equal(summary.latestRiskLevel, "Moderate");
  assert.equal(summary.latestRiskScore, 58);
  assert.equal(summary.timeRange.newestIngestedAt, "2026-06-29T03:00:00.000Z");
  assert.equal(summary.timeRange.oldestIngestedAt, "2026-06-29T02:00:00.000Z");
});

test("readAreaHistory skips corrupt JSONL rows instead of crashing the dashboard history view", async () => {
  const historyDir = await mkdtemp(path.join(os.tmpdir(), "floodguard-history-"));
  const historyPath = path.join(historyDir, "parramatta.jsonl");

  try {
    await writeFile(
      historyPath,
      [
        JSON.stringify(buildAreaHistoryRecord(mockAreaSignals())),
        "{bad json line",
        JSON.stringify(
          buildAreaHistoryRecord(
            mockAreaSignals({
              ingestedAt: "2026-06-29T04:00:00.000Z",
              riskAssessment: {
                concernLevel: "Low",
                score: 18,
                signals: {},
                features: {},
                decisionAudit: { reliability: { score: 88, level: "High" } },
              },
            }),
          ),
        ),
      ].join("\n"),
      "utf8",
    );

    const history = await readAreaHistory(historyDir, "parramatta", 10);

    assert.equal(history.length, 2);
    assert.equal(history[0].ingestedAt, "2026-06-29T04:00:00.000Z");
    assert.equal(history[1].ingestedAt, "2026-06-29T03:00:00.000Z");
  } finally {
    await rm(historyDir, { force: true, recursive: true });
  }
});

test("appendAreaHistory still records the next snapshot when the previous last line is corrupt", async () => {
  const historyDir = await mkdtemp(path.join(os.tmpdir(), "floodguard-history-"));
  const historyPath = path.join(historyDir, "parramatta.jsonl");

  try {
    await writeFile(historyPath, "{broken", "utf8");

    await appendAreaHistory(
      historyDir,
      mockAreaSignals({ ingestedAt: "2026-06-29T05:00:00.000Z" }),
    );

    const history = await readAreaHistory(historyDir, "parramatta", 10);
    assert.equal(history.length, 1);
    assert.equal(history[0].ingestedAt, "2026-06-29T05:00:00.000Z");
  } finally {
    await rm(historyDir, { force: true, recursive: true });
  }
});
