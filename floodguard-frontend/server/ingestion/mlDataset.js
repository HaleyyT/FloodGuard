import { buildDatasetQualityReport, buildFeatureRows } from "./features.js";

export const mlDatasetFieldOrder = [
  "areaId",
  "areaName",
  "observedAt",
  "riskScore",
  "ruleConcernLevel",
  "targetElevatedConcern",
  "labelSource",
  "rainfallLatestMm",
  "rainfall1hMm",
  "rainfall3hMm",
  "rainfall24hMm",
  "rainfall72hMm",
  "antecedentWetnessMm",
  "antecedentRainfallIndex",
  "riverLatestM",
  "riverDelta1hM",
  "riverDelta3hM",
  "riverTrendCode",
  "rateOfRiseMPerHour",
  "dataFreshnessScore",
  "sourceCoverage",
  "decisionReliabilityScore",
  "confidence",
  "warningActive",
  "warningStatus",
  "areaRelevanceScore",
  "nearestStationDistanceKm",
];

function toTimestamp(value) {
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function mapRiverTrendCode(trend) {
  if (trend === "rising") return 1;
  if (trend === "steady") return 0;
  if (trend === "falling") return -1;
  return null;
}

function deriveWarningFields(record = {}) {
  const warningReading = (record.sourceReadings ?? []).find((reading) =>
    ["warning", "warnings"].includes(reading.signalType),
  );
  const warningStatus = typeof warningReading?.value === "string" ? warningReading.value : null;

  if (!warningStatus) {
    return { warningActive: null, warningStatus: null };
  }

  return {
    warningActive: ["no_current_warning", "unknown", "missing", "not_configured"].includes(warningStatus)
      ? 0
      : 1,
    warningStatus,
  };
}

export function buildMlDatasetRows(historyRecords = []) {
  const chronological = [...historyRecords].sort(
    (a, b) => toTimestamp(a.ingestedAt) - toTimestamp(b.ingestedAt),
  );
  const featureRows = buildFeatureRows(chronological);

  return featureRows.map((row, index) => {
    const record = chronological[index] ?? {};
    const warning = deriveWarningFields(record);

    return {
      areaId: row.areaId,
      areaName: row.areaName,
      observedAt: row.ingestedAt,
      riskScore: row.riskScore,
      ruleConcernLevel: row.targetRiskLevel,
      targetElevatedConcern: row.targetElevatedConcern,
      labelSource: "rule_derived",
      rainfallLatestMm: row.rainfallLatestMm,
      rainfall1hMm: row.rainfall1hMm,
      rainfall3hMm: row.rainfall3hMm,
      rainfall24hMm: row.rainfall24hMm,
      rainfall72hMm: row.rainfall72hMm,
      antecedentWetnessMm: row.antecedentWetnessMm,
      antecedentRainfallIndex: row.wetnessIndex,
      riverLatestM: row.riverLatestM,
      riverDelta1hM: row.riverDelta1hM,
      riverDelta3hM: row.riverDelta3hM,
      riverTrendCode: mapRiverTrendCode(row.riverTrend),
      rateOfRiseMPerHour: row.riverDelta1hM,
      dataFreshnessScore: row.dataFreshnessScore,
      sourceCoverage: row.sourceCoverage ?? row.inputCoverage,
      decisionReliabilityScore: row.decisionReliabilityScore,
      confidence: row.confidence,
      warningActive: warning.warningActive,
      warningStatus: warning.warningStatus,
      areaRelevanceScore: row.areaRelevanceScore,
      nearestStationDistanceKm: row.nearestStationDistanceKm,
    };
  });
}

export function buildMlReadinessReport(datasetRows = [], datasetQuality = null, options = {}) {
  const elevatedCount = datasetRows.filter((row) => row.targetElevatedConcern === 1).length;
  const lowCount = datasetRows.filter((row) => row.targetElevatedConcern === 0).length;
  const readyForPrototypeTraining = datasetQuality?.readyForModelComparison ?? false;
  const areas = options.areas ?? [...new Set(datasetRows.map((row) => row.areaName).filter(Boolean))];

  return {
    areaId: options.areaId ?? null,
    areaName: options.areaName ?? null,
    rows: datasetRows.length,
    areas,
    labelSource: "rule_derived",
    hasIndependentLabels: false,
    classBalance: {
      low: lowCount,
      elevated: elevatedCount,
    },
    readyForPrototypeTraining,
    readyForValidatedML: false,
    readyForTraining: readyForPrototypeTraining,
    readyForRuleComparison: readyForPrototypeTraining,
    reason: readyForPrototypeTraining
      ? "Prototype training is possible, but labels are not independent flood outcomes."
      : datasetQuality?.warnings?.[0] ?? "Collect more reliable feature history before prototype training.",
    datasetQuality,
    nextStep:
      "Use the Python floodguard-ml workspace for offline training, evaluation, and model-card reporting while keeping ML in shadow mode.",
  };
}

export function buildMlDatasetBundle(historyRecords = [], options = {}) {
  const rows = buildMlDatasetRows(historyRecords);
  const featureRows = buildFeatureRows(historyRecords);
  const datasetQuality = buildDatasetQualityReport(featureRows);

  return {
    areaId: options.areaId ?? rows[0]?.areaId ?? null,
    areaName: options.areaName ?? rows[0]?.areaName ?? null,
    labelSource: "rule_derived",
    fields: mlDatasetFieldOrder,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    rows,
    readiness: buildMlReadinessReport(rows, datasetQuality, options),
  };
}

export function mlDatasetRowsToCsv(rows = []) {
  const csvRows = [mlDatasetFieldOrder.join(",")];

  for (const row of rows) {
    csvRows.push(
      mlDatasetFieldOrder
        .map((field) => {
          const value = row[field] ?? "";
          return typeof value === "string" && value.includes(",") ? `"${value}"` : value;
        })
        .join(","),
    );
  }

  return csvRows.join("\n");
}
