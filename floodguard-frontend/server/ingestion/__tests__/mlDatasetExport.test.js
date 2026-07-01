import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import test from "node:test";

import { exportMlDataset } from "../../export-ml-dataset.js";

function mockHistoryRecord({
  areaId = "parramatta",
  areaName = "Parramatta, NSW",
  ingestedAt = "2026-07-01T00:00:00Z",
  riskLevel = "Moderate",
  targetElevatedConcern = 1,
} = {}) {
  return {
    areaId,
    areaName,
    ingestedAt,
    riskLevel,
    riskScore: targetElevatedConcern ? 58 : 18,
    riskSignals: {
      rainfallPressure: targetElevatedConcern ? 0.62 : 0.12,
      riverPressure: targetElevatedConcern ? 0.41 : 0.08,
      wetnessPressure: targetElevatedConcern ? 0.35 : 0.09,
      confidence: targetElevatedConcern ? 0.84 : 0.92,
      inputCoverage: 0.9,
    },
    riskFeatures: {
      rainfall1hMm: targetElevatedConcern ? 12 : 1,
      rainfall3hMm: targetElevatedConcern ? 18 : 2,
      rainfall24hMm: targetElevatedConcern ? 36 : 4,
      rainfall72hMm: targetElevatedConcern ? 64 : 7,
      antecedentWetnessMm: targetElevatedConcern ? 90 : 10,
      wetnessIndex: targetElevatedConcern ? 0.72 : 0.1,
      riverLatestM: targetElevatedConcern ? 1.18 : 0.52,
      riverDelta1hM: targetElevatedConcern ? 0.16 : 0.01,
      riverDelta3hM: targetElevatedConcern ? 0.29 : 0.02,
      riverTrend: targetElevatedConcern ? "rising" : "steady",
      dataFreshnessScore: 91,
      sourceCoverage: 0.88,
    },
    decisionReliability: {
      score: 83,
      level: "high",
    },
    rainfall: {
      latestValidRainfallMm: targetElevatedConcern ? 12 : 1,
      pointCount: 4,
    },
    river: {
      stationCount: 2,
      primaryHeightM: targetElevatedConcern ? 1.18 : 0.52,
    },
    freshness: {
      staleSourceCount: 0,
      fallbackSourceCount: 0,
      failedSourceCount: 0,
    },
    publicSignalSummary: {
      recentReports: 1,
      actionableReports: 1,
      imageEvidenceReports: 0,
      imageReviewQueueCount: 0,
      urgentImageReviewCount: 0,
      elevatedImageReviewCount: 0,
      averageQuality: 0.8,
    },
    areaRelevance: {
      score: 100,
      matchedSignals: 5,
      expectedSignals: 5,
      matchedRiverStationCount: 2,
      missingRiverStationCount: 0,
    },
    spatialRelevance: {
      nearestStationDistanceKm: 0.8,
    },
    dataQuality: {
      status: "good",
    },
    sourceReadings: [
      {
        signalType: "warning",
        value: "no_current_warning",
      },
    ],
  };
}

test("exportMlDataset writes JSON and CSV outputs with explicit label source", async () => {
  const historyRoot = await mkdtemp(path.join(os.tmpdir(), "floodguard-ml-history-"));
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), "floodguard-ml-output-"));

  try {
    await writeFile(
      path.join(historyRoot, "parramatta.jsonl"),
      `${JSON.stringify(mockHistoryRecord())}\n`,
      "utf8",
    );

    const result = await exportMlDataset({
      historyDir: historyRoot,
      outputDir: outputRoot,
      areas: [{ id: "parramatta", name: "Parramatta, NSW" }],
    });

    const jsonExport = JSON.parse(await readFile(result.jsonPath, "utf8"));
    const csvExport = await readFile(result.csvPath, "utf8");

    assert.equal(result.rowCount, 1);
    assert.equal(jsonExport.labelSource, "rule_derived");
    assert.equal(jsonExport.rows[0].labelSource, "rule_derived");
    assert.match(csvExport, /areaId,areaName,observedAt/);
    assert.match(csvExport, /rule_derived/);
  } finally {
    await rm(historyRoot, { recursive: true, force: true });
    await rm(outputRoot, { recursive: true, force: true });
  }
});

test("exportMlDataset handles missing history without crashing", async () => {
  const historyRoot = await mkdtemp(path.join(os.tmpdir(), "floodguard-ml-empty-history-"));
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), "floodguard-ml-empty-output-"));

  try {
    const result = await exportMlDataset({
      historyDir: historyRoot,
      outputDir: outputRoot,
      areas: [{ id: "parramatta", name: "Parramatta, NSW" }],
    });

    const jsonExport = JSON.parse(await readFile(result.jsonPath, "utf8"));
    const csvExport = await readFile(result.csvPath, "utf8");

    assert.equal(result.rowCount, 0);
    assert.equal(jsonExport.rows.length, 0);
    assert.match(csvExport, /areaId,areaName,observedAt/);
  } finally {
    await rm(historyRoot, { recursive: true, force: true });
    await rm(outputRoot, { recursive: true, force: true });
  }
});
