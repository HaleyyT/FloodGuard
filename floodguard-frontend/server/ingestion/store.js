import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path, { dirname } from "node:path";

function parseJsonLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

export async function writeLatestSignals(filePath, signals) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(signals, null, 2)}\n`, "utf8");
}

export async function readLatestSignals(filePath) {
  const content = await readFile(filePath, "utf8");
  return JSON.parse(content);
}

export function buildAreaHistoryRecord(areaSignals) {
  const sourceReadings = (areaSignals.sourceMetadata ?? []).map((metadata) => ({
    area: areaSignals.area.name,
    stationId: metadata.type === "rainfall"
      ? areaSignals.rainfallSeries?.stationNumber ?? areaSignals.rainfallSeries?.stationName ?? null
      : metadata.type === "river"
        ? areaSignals.riverContext?.primaryStation?.stationName ?? null
        : areaSignals.weatherObservations?.stationName ?? null,
    signalType: metadata.type,
    value: metadata.type === "rainfall"
      ? areaSignals.rainfallSeries?.latestValidRainfallMm ?? null
      : metadata.type === "river"
        ? areaSignals.riverContext?.primaryStation?.heightM ?? null
        : metadata.type === "weather"
          ? areaSignals.weatherObservations?.rainfallTraceMm ?? null
          : areaSignals.warningSummary?.status ?? null,
    unit: metadata.type === "rainfall" ? "mm" : metadata.type === "river" ? "m" : metadata.type === "weather" ? "mm" : "status",
    observedAt: metadata.observedAt ?? null,
    fetchedAt: metadata.fetchedAt ?? areaSignals.ingestedAt,
    sourceName: metadata.label,
    sourceUrl: metadata.source ?? null,
    sourceStrength: metadata.sourceStrength ?? "unknown",
    dataMode: metadata.dataMode ?? metadata.mode ?? "unknown",
    freshnessStatus: metadata.freshnessStatus ?? "unknown",
  }));

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
    decisionAuditSnapshot: {
      hazardPressure: areaSignals.riskAssessment.decisionAudit?.hazardPressure ?? null,
      evidenceConfidence: areaSignals.riskAssessment.decisionAudit?.evidenceConfidence ?? null,
      officialWarningContext: areaSignals.riskAssessment.decisionAudit?.officialWarningContext ?? null,
      recommendationType: areaSignals.riskAssessment.decisionAudit?.recommendationType ?? null,
      recommendationNote:
        areaSignals.riskAssessment.decisionAudit?.decisionRecommendation?.note ?? null,
      whatIncreasedConcern:
        areaSignals.riskAssessment.decisionAudit?.whatIncreasedConcern ?? [],
      whatReducedConcern:
        areaSignals.riskAssessment.decisionAudit?.whatReducedConcern ?? [],
      excludedEvidence:
        areaSignals.riskAssessment.decisionAudit?.excludedEvidence ?? [],
      sourceLimitations:
        areaSignals.riskAssessment.decisionAudit?.sourceLimitations ?? [],
      checkNext: areaSignals.riskAssessment.decisionAudit?.checkNext ?? [],
    },
    publicSignalSummary: areaSignals.publicSignalSummary,
    spatialRelevance: {
      status: areaSignals.spatialRelevance?.status ?? "unknown",
      stationCount: areaSignals.spatialRelevance?.stationCount ?? 0,
      nearestStationDistanceKm: areaSignals.spatialRelevance?.nearestStationDistanceKm ?? null,
      coverageRadiusKm: areaSignals.spatialRelevance?.coverageRadiusKm ?? null,
      method: areaSignals.spatialRelevance?.method ?? "unknown",
    },
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
    sourceReadings,
  };
}

function dedupeKeyForRecord(record) {
  const sourceSignature = (record.sourceReadings ?? [])
    .map((reading) =>
      [reading.sourceName, reading.stationId, reading.signalType, reading.observedAt].join(":"),
    )
    .sort()
    .join("|");

  return [record.areaId, record.ingestedAt, sourceSignature].join("|");
}

export async function appendAreaHistory(historyDir, areaSignals) {
  await mkdir(historyDir, { recursive: true });
  const historyPath = path.join(historyDir, `${areaSignals.area.id}.jsonl`);
  const record = buildAreaHistoryRecord(areaSignals);
  const nextKey = dedupeKeyForRecord(record);

  try {
    const existing = await readFile(historyPath, "utf8");
    const lastLine = existing.trim().split("\n").filter(Boolean).at(-1);

    if (lastLine) {
      const previousRecord = parseJsonLine(lastLine);
      if (!previousRecord) {
        const separator = existing.endsWith("\n") || existing.length === 0 ? "" : "\n";
        await appendFile(historyPath, `${separator}${JSON.stringify(record)}\n`, "utf8");
        return record;
      }
      if (dedupeKeyForRecord(previousRecord) === nextKey) {
        return previousRecord;
      }
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

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
  const options =
    typeof limit === "number"
      ? { limit, sinceHours: null }
      : {
          limit: limit?.limit ?? 24,
          sinceHours: limit?.sinceHours ?? null,
        };

  try {
    const content = await readFile(historyPath, "utf8");
    const records = content
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => parseJsonLine(line))
      .filter(Boolean)
      .filter((record) => {
        if (options.sinceHours === null) return true;
        const ingestedAtMs = new Date(record.ingestedAt).getTime();
        if (Number.isNaN(ingestedAtMs)) return false;
        return ingestedAtMs >= Date.now() - options.sinceHours * 60 * 60 * 1000;
      });

    return records.slice(-options.limit).reverse();
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

function sourceCachePath(cacheDir, cacheKey) {
  return path.join(cacheDir, `${cacheKey}.json`);
}

export async function writeSourceCache(cacheDir, cacheKey, payload) {
  await mkdir(cacheDir, { recursive: true });
  await writeFile(sourceCachePath(cacheDir, cacheKey), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

export async function readSourceCache(cacheDir, cacheKey) {
  try {
    const content = await readFile(sourceCachePath(cacheDir, cacheKey), "utf8");
    return JSON.parse(content);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}
