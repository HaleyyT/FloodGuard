const elevatedRiskLevels = new Set(["Moderate", "High"]);
const qualityFeatureFields = [
  "rainfall24hMm",
  "rainfall72hMm",
  "riverStationCount",
  "rainfallPressure",
  "riverPressure",
  "wetnessPressure",
  "confidence",
  "decisionReliabilityScore",
  "areaRelevanceScore",
  "nearestStationDistanceKm",
];

function toTimestamp(value) {
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export function buildFeatureRows(historyRecords = []) {
  const chronological = [...historyRecords].sort(
    (a, b) => toTimestamp(a.ingestedAt) - toTimestamp(b.ingestedAt),
  );

  return chronological.map((record, index) => {
    const previous = chronological[index - 1] ?? null;
    const previousRiskScore = previous?.riskScore ?? null;
    const scoreDelta =
      typeof previousRiskScore === "number" && typeof record.riskScore === "number"
        ? record.riskScore - previousRiskScore
        : null;

    return {
      areaId: record.areaId,
      areaName: record.areaName,
      ingestedAt: record.ingestedAt,
      targetRiskLevel: record.riskLevel,
      targetElevatedConcern: elevatedRiskLevels.has(record.riskLevel) ? 1 : 0,
      riskScore: record.riskScore,
      decisionReliabilityScore: record.decisionReliability?.score ?? null,
      decisionReliabilityLevel: record.decisionReliability?.level ?? "unknown",
      previousRiskScore,
      scoreDelta,
      rainfallLatestMm: record.rainfall.latestValidRainfallMm ?? 0,
      rainfallPointCount: record.rainfall.pointCount ?? 0,
      rainfall24hMm: record.riskFeatures?.rainfall24hMm ?? 0,
      rainfall72hMm: record.riskFeatures?.rainfall72hMm ?? 0,
      riverStationCount: record.river.stationCount ?? 0,
      riverPrimaryHeightM: record.river.primaryHeightM ?? null,
      risingRiverStations: record.riskFeatures?.risingRiverStations ?? 0,
      steadyRiverStations: record.riskFeatures?.steadyRiverStations ?? 0,
      fallingRiverStations: record.riskFeatures?.fallingRiverStations ?? 0,
      rainfallPressure: record.riskSignals?.rainfallPressure ?? 0,
      riverPressure: record.riskSignals?.riverPressure ?? 0,
      wetnessPressure: record.riskSignals?.wetnessPressure ?? 0,
      publicSignalPressure: record.riskSignals?.publicSignalPressure ?? 0,
      confidence: record.riskSignals?.confidence ?? 0,
      recentCommunityReports: record.publicSignalSummary?.recentReports ?? 0,
      actionableCommunityReports: record.publicSignalSummary?.actionableReports ?? 0,
      imageEvidenceReports: record.publicSignalSummary?.imageEvidenceReports ?? 0,
      imageReviewQueueCount: record.publicSignalSummary?.imageReviewQueueCount ?? 0,
      urgentImageReviewCount: record.publicSignalSummary?.urgentImageReviewCount ?? 0,
      elevatedImageReviewCount: record.publicSignalSummary?.elevatedImageReviewCount ?? 0,
      averageCommunityReportQuality: record.publicSignalSummary?.averageQuality ?? 0,
      fallbackSourceCount: record.riskFeatures?.fallbackSourceCount ?? 0,
      staleSourceCount: record.riskFeatures?.staleSourceCount ?? 0,
      failedSourceCount: record.riskFeatures?.failedSourceCount ?? 0,
      areaRelevanceScore: record.areaRelevance?.score ?? 0,
      matchedAreaSignals: record.areaRelevance?.matchedSignals ?? 0,
      expectedAreaSignals: record.areaRelevance?.expectedSignals ?? 0,
      matchedRiverStationCount: record.areaRelevance?.matchedRiverStationCount ?? 0,
      missingRiverStationCount: record.areaRelevance?.missingRiverStationCount ?? 0,
      spatialStationCount: record.spatialRelevance?.stationCount ?? 0,
      nearestStationDistanceKm: record.spatialRelevance?.nearestStationDistanceKm ?? null,
      spatialCoverageRadiusKm: record.spatialRelevance?.coverageRadiusKm ?? null,
      dataQualityStatus: record.dataQuality?.status ?? "unknown",
      areaRelevanceStatus: record.areaRelevance?.status ?? "unknown",
      spatialRelevanceStatus: record.spatialRelevance?.status ?? "unknown",
      freshnessStatus: record.freshness?.status ?? "unknown",
    };
  });
}

export function buildFeatureSummary(featureRows = []) {
  const latest = featureRows.at(-1) ?? null;
  const elevatedRows = featureRows.filter((row) => row.targetElevatedConcern === 1);

  return {
    rowCount: featureRows.length,
    elevatedCount: elevatedRows.length,
    latest,
    readyForTraining: featureRows.length >= 30 && elevatedRows.length >= 5,
    readinessNote:
      featureRows.length >= 30 && elevatedRows.length >= 5
        ? "Enough starter rows exist for a simple baseline experiment."
        : "Keep collecting history before training; this feature table is the model-ready foundation.",
  };
}

function average(values) {
  const usable = values.filter((value) => typeof value === "number" && Number.isFinite(value));
  if (usable.length === 0) return null;
  return Math.round((usable.reduce((total, value) => total + value, 0) / usable.length) * 10) / 10;
}

function buildMissingValueCounts(featureRows) {
  return Object.fromEntries(
    qualityFeatureFields.map((field) => [
      field,
      featureRows.filter((row) => row[field] === null || row[field] === undefined).length,
    ]),
  );
}

function gate(name, passed, actual, required, note) {
  return {
    name,
    status: passed ? "pass" : "collecting",
    actual,
    required,
    note,
  };
}

export function buildDatasetQualityReport(featureRows = []) {
  const rowCount = featureRows.length;
  const elevatedRows = featureRows.filter((row) => row.targetElevatedConcern === 1);
  const lowRows = featureRows.filter((row) => row.targetElevatedConcern === 0);
  const staleRows = featureRows.filter((row) => row.staleSourceCount > 0);
  const fallbackRows = featureRows.filter((row) => row.fallbackSourceCount > 0);
  const failedRows = featureRows.filter((row) => row.failedSourceCount > 0);
  const gates = [
    gate("Starter history", rowCount >= 30, rowCount, 30, "Collect at least 30 rows before comparing models."),
    gate(
      "Elevated examples",
      elevatedRows.length >= 5,
      elevatedRows.length,
      5,
      "Collect enough moderate/high concern examples to avoid a one-class dataset.",
    ),
    gate(
      "Low examples",
      lowRows.length >= 5,
      lowRows.length,
      5,
      "Keep low-concern examples so future models learn normal conditions too.",
    ),
    gate(
      "Source stability",
      failedRows.length === 0,
      failedRows.length,
      0,
      "Failed source rows should be investigated before training.",
    ),
  ];
  const warnings = [
    rowCount < 30 ? "History is still small for model comparison." : null,
    elevatedRows.length === 0 ? "No elevated-concern examples are present yet." : null,
    staleRows.length > rowCount / 2 ? "Most rows currently come from stale source data." : null,
    fallbackRows.length > rowCount / 2 ? "Most rows currently rely on fallback sources." : null,
    failedRows.length > 0 ? `${failedRows.length} row(s) include failed source inputs.` : null,
  ].filter(Boolean);

  return {
    rowCount,
    elevatedCount: elevatedRows.length,
    lowCount: lowRows.length,
    classBalanceStatus:
      elevatedRows.length > 0 && lowRows.length > 0 ? "two-class-history" : "single-class-history",
    averageReliabilityScore: average(featureRows.map((row) => row.decisionReliabilityScore)),
    staleRowCount: staleRows.length,
    fallbackRowCount: fallbackRows.length,
    failedRowCount: failedRows.length,
    missingValueCounts: buildMissingValueCounts(featureRows),
    gates,
    readyForModelComparison: gates.every((item) => item.status === "pass"),
    warnings,
  };
}

export function featureRowsToCsv(featureRows = []) {
  if (featureRows.length === 0) return "";

  const headers = Object.keys(featureRows[0]);
  const rows = featureRows.map((row) =>
    headers
      .map((header) => {
        const value = row[header] ?? "";
        return typeof value === "string" && value.includes(",") ? `"${value}"` : value;
      })
      .join(","),
  );

  return [headers.join(","), ...rows].join("\n");
}
