import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path, { dirname } from "node:path";

export async function writeLatestSignals(filePath, signals) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(signals, null, 2)}\n`, "utf8");
}

export async function readLatestSignals(filePath) {
  const content = await readFile(filePath, "utf8");
  return JSON.parse(content);
}

export function buildAreaHistoryRecord(areaSignals) {
  return {
    areaId: areaSignals.area.id,
    areaName: areaSignals.area.name,
    catchment: areaSignals.area.catchment,
    ingestedAt: areaSignals.ingestedAt,
    riskLevel: areaSignals.riskAssessment.concernLevel,
    riskScore: areaSignals.riskAssessment.score,
    riskSignals: areaSignals.riskAssessment.signals,
    riskFeatures: areaSignals.riskAssessment.features,
    decisionReliability: areaSignals.riskAssessment.decisionAudit?.reliability ?? null,
    rainfall: {
      latestValidRainfallMm: areaSignals.rainfallSeries.latestValidRainfallMm,
      pointCount: areaSignals.rainfallSeries.points.length,
      latestPointTime: areaSignals.rainfallSeries.points.at(-1)?.time ?? null,
      sourceLabel: areaSignals.rainfallSeries.sourceLabel,
      aggregation: areaSignals.rainfallSeries.aggregation,
    },
    river: {
      stationCount: areaSignals.riverContext.stationCount,
      primaryStationName: areaSignals.riverContext.primaryStation?.stationName ?? null,
      primaryHeightM: areaSignals.riverContext.primaryStation?.heightM ?? null,
      primaryTendency: areaSignals.riverContext.primaryStation?.tendency ?? null,
      tendencyCounts: areaSignals.riverContext.tendencyCounts,
      issuedDate: areaSignals.riverContext.issuedDate,
    },
    dataQuality: areaSignals.dataQuality,
    freshness: areaSignals.freshness,
    sourceFreshness: areaSignals.sourceMetadata.map((metadata) => ({
      label: metadata.label,
      type: metadata.type,
      mode: metadata.mode,
      observedAt: metadata.observedAt,
      ageHours: metadata.ageHours,
      freshnessStatus: metadata.freshnessStatus,
    })),
    areaRelevance: {
      status: areaSignals.areaRelevance?.status ?? "unknown",
      score: areaSignals.areaRelevance?.score ?? 0,
      matchedSignals: areaSignals.areaRelevance?.matchedSignals ?? 0,
      expectedSignals: areaSignals.areaRelevance?.expectedSignals ?? 0,
      matchedRiverStationCount: areaSignals.areaRelevance?.matchedRiverStations?.length ?? 0,
      missingRiverStationCount: areaSignals.areaRelevance?.missingRiverStations?.length ?? 0,
    },
  };
}

export async function appendAreaHistory(historyDir, areaSignals) {
  await mkdir(historyDir, { recursive: true });
  const historyPath = path.join(historyDir, `${areaSignals.area.id}.jsonl`);
  const record = buildAreaHistoryRecord(areaSignals);
  await appendFile(historyPath, `${JSON.stringify(record)}\n`, "utf8");
  return record;
}

export async function appendRegionalHistory(historyDir, regionalSignals) {
  const records = Object.values(regionalSignals.areas ?? {}).map((areaSignals) =>
    appendAreaHistory(historyDir, areaSignals),
  );

  return Promise.all(records);
}

export async function readAreaHistory(historyDir, areaId, limit = 24) {
  const historyPath = path.join(historyDir, `${areaId}.jsonl`);

  try {
    const content = await readFile(historyPath, "utf8");
    return content
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .slice(-limit)
      .reverse();
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}
