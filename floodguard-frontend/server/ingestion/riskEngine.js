function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function roundNumber(value, decimals = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Number(value.toFixed(decimals));
}

function average(values = []) {
  const usableValues = values.filter((value) => typeof value === "number" && Number.isFinite(value));
  if (usableValues.length === 0) return null;
  return usableValues.reduce((total, value) => total + value, 0) / usableValues.length;
}

function validRainfallValues(points = []) {
  return points
    .map((point) => point.rainfallMm)
    .filter((value) => typeof value === "number" && !Number.isNaN(value));
}

function rainfallWindowTotal(points = [], hours = 24) {
  const validPoints = points
    .filter((point) => typeof point.rainfallMm === "number" && point.time)
    .map((point) => ({
      ...point,
      timestamp: new Date(point.time).getTime(),
    }))
    .filter((point) => !Number.isNaN(point.timestamp));

  if (validPoints.length === 0) return 0;

  const latestTimestamp = Math.max(...validPoints.map((point) => point.timestamp));
  const windowStart = latestTimestamp - hours * 60 * 60 * 1000;

  return validPoints
    .filter((point) => point.timestamp >= windowStart)
    .reduce((sum, point) => sum + point.rainfallMm, 0);
}

function countByTendency(stations = [], tendency) {
  return stations.filter((station) => station.tendency?.toLowerCase() === tendency).length;
}

function stationHeights(station) {
  return (station?.points ?? [])
    .map((point) => point.heightM)
    .filter((value) => typeof value === "number" && Number.isFinite(value));
}

function buildRiverBaselineFeatures(riverStations = [], primaryStation = null) {
  const station = primaryStation ?? riverStations[0] ?? null;
  const primaryHeight = station?.heightM ?? null;
  const pointHeights = stationHeights(station);
  const previousHeights = pointHeights.slice(1);
  const recentBaseline = average(previousHeights) ?? station?.previousHeightM ?? null;
  const heightDelta =
    typeof primaryHeight === "number" && typeof recentBaseline === "number"
      ? primaryHeight - recentBaseline
      : null;
  const baselineMethod =
    previousHeights.length > 0
      ? "station-recent-observations"
      : typeof station?.previousHeightM === "number"
        ? "station-previous-observation"
        : "unavailable";

  return {
    primaryRiverHeightM: roundNumber(primaryHeight),
    riverBaselineHeightM: roundNumber(recentBaseline),
    riverHeightDeltaM: roundNumber(heightDelta, 3),
    riverBaselineSampleCount:
      previousHeights.length || (typeof station?.previousHeightM === "number" ? 1 : 0),
    riverBaselineMethod: baselineMethod,
  };
}

function buildFreshnessScore(sourceMetadata = []) {
  const scoredSources = sourceMetadata.map((source) => {
    if (source.status === "failed") return 0;
    if (source.mode === "local-fallback") return 35;
    if (source.freshnessStatus === "stale") return 45;
    if (source.freshnessStatus === "unknown") return 65;

    const ageHours = typeof source.ageHours === "number" ? source.ageHours : 0;
    return clamp(100 - Math.max(0, ageHours - 1) * 4);
  });

  return scoredSources.length > 0 ? Math.round(average(scoredSources)) : 0;
}

function countContributingSignals(signals, riskSignals) {
  const publicSignalSummary = signals.publicSignalSummary ?? {};
  return [
    riskSignals.features.rainfall1hMm > 0,
    riskSignals.features.rainfall3hMm > 0,
    riskSignals.features.rainfall24hMm > 0,
    riskSignals.features.rainfall72hMm > 0,
    riskSignals.features.riverStationCount > 0,
    riskSignals.features.risingRiverStations > 0,
    riskSignals.features.riverHeightDeltaM !== null &&
      Math.abs(riskSignals.features.riverHeightDeltaM) >= 0.02,
    Boolean(signals.weatherObservations?.stationName),
    (publicSignalSummary.actionableReports ?? 0) > 0,
  ].filter(Boolean).length;
}

function buildScoreComponents(riskSignals) {
  return [
    {
      label: "Rainfall pressure",
      value: riskSignals.rainfallPressure,
      weight: 0.35,
    },
    {
      label: "River pressure",
      value: riskSignals.riverPressure,
      weight: 0.3,
    },
    {
      label: "Wetness pressure",
      value: riskSignals.wetnessPressure,
      weight: 0.18,
    },
    {
      label: "Weather pressure",
      value: riskSignals.weatherPressure,
      weight: 0.1,
    },
    {
      label: "Public signal pressure",
      value: riskSignals.publicSignalPressure,
      weight: 0.07,
    },
  ].map((component) => ({
    ...component,
    contribution: Number((component.value * component.weight).toFixed(1)),
  }));
}

function buildReliability(signals, riskSignals) {
  const areaRelevanceScore = signals.areaRelevance?.score ?? 100;
  const coverageScore = signals.dataQuality?.coverageScore ?? 0;
  const coreSources = (signals.sourceMetadata ?? []).filter((source) =>
    ["rainfall", "river"].includes(source.type),
  );
  const contextSources = (signals.sourceMetadata ?? []).filter(
    (source) => !["rainfall", "river"].includes(source.type),
  );
  const staleCoreCount = coreSources.filter((source) => source.freshnessStatus === "stale").length;
  const staleContextCount = contextSources.filter(
    (source) => source.freshnessStatus === "stale",
  ).length;
  const fallbackCoreCount = coreSources.filter((source) => source.mode === "local-fallback").length;
  const failedCoreCount = coreSources.filter((source) => source.status === "failed").length;
  const reliabilityScore = clamp(
    Math.round(riskSignals.confidence * 0.55 + areaRelevanceScore * 0.25 + coverageScore * 0.2),
  );
  const warnings = [];
  const blockers = [];

  if (staleCoreCount > 0) {
    blockers.push(`${staleCoreCount} core flood gauge source(s) are stale`);
  }

  if (staleContextCount > 0) {
    warnings.push(`${staleContextCount} supporting context source(s) are stale`);
  }

  if (fallbackCoreCount > 0) {
    blockers.push(`${fallbackCoreCount} core flood gauge source(s) are using fallback data`);
  }

  if (failedCoreCount > 0) {
    blockers.push(`${failedCoreCount} core flood gauge source(s) failed during ingestion`);
  }

  if ((signals.dataQuality?.missing ?? []).length > 0) {
    blockers.push(`Missing signal layer(s): ${signals.dataQuality.missing.join(", ")}`);
  }

  if (areaRelevanceScore < 80) {
    warnings.push(`Area signal fit is ${areaRelevanceScore}%`);
  }

  return {
    score: reliabilityScore,
    level: reliabilityScore >= 80 ? "High" : reliabilityScore >= 55 ? "Medium" : "Low",
    inputs: {
      confidence: riskSignals.confidence,
      areaRelevanceScore,
      coverageScore,
    },
    warnings,
    blockers,
  };
}

function buildDecisionAudit(signals, riskSignals, score, concernLevel) {
  const components = buildScoreComponents(riskSignals);
  const reliability = buildReliability(signals, riskSignals);

  return {
    concernLevel,
    score,
    scoreFormula: "rainfall 35% + river 30% + wetness 18% + weather 10% + public signals 7%",
    thresholds: {
      moderate: 45,
      high: 70,
    },
    components,
    reliability,
    sourceSummary: {
      status: signals.freshness?.status ?? "unknown",
      staleSourceCount: signals.freshness?.staleSourceCount ?? 0,
      fallbackSourceCount: signals.freshness?.fallbackSourceCount ?? 0,
      failedSourceCount: signals.freshness?.failedSourceCount ?? 0,
    },
    publicSignals: {
      status: signals.publicSignalSummary?.status ?? "unknown",
      recentReports: signals.publicSignalSummary?.recentReports ?? 0,
      actionableReports: signals.publicSignalSummary?.actionableReports ?? 0,
      imageEvidenceReports: signals.publicSignalSummary?.imageEvidenceReports ?? 0,
      imageReviewQueueCount: signals.publicSignalSummary?.imageReviewQueueCount ?? 0,
      urgentImageReviewCount: signals.publicSignalSummary?.urgentImageReviewCount ?? 0,
      elevatedImageReviewCount: signals.publicSignalSummary?.elevatedImageReviewCount ?? 0,
      publicSignalPressure: signals.publicSignalSummary?.publicSignalPressure ?? 0,
      note: signals.publicSignalSummary?.note ?? "No public signal summary is available.",
    },
  };
}

export function buildRiskSignals(signals) {
  const weather = signals.weatherObservations ?? {};
  const rainfallSeries = signals.rainfallSeries ?? {};
  const riverContext = signals.riverContext ?? {};
  const rainfallValues = validRainfallValues(rainfallSeries.points);
  const riverStations = riverContext.stations ?? [];
  const fallbackSourceCount = signals.freshness?.fallbackSourceCount ?? 0;
  const failedSourceCount = signals.freshness?.failedSourceCount ?? 0;
  const staleSourceCount = signals.freshness?.staleSourceCount ?? 0;
  const coreSources = (signals.sourceMetadata ?? []).filter((source) =>
    ["rainfall", "river"].includes(source.type),
  );
  const contextSources = (signals.sourceMetadata ?? []).filter(
    (source) => !["rainfall", "river"].includes(source.type),
  );
  const staleCoreCount = coreSources.filter((source) => source.freshnessStatus === "stale").length;
  const staleContextCount = contextSources.filter(
    (source) => source.freshnessStatus === "stale",
  ).length;
  const fallbackCoreCount = coreSources.filter((source) => source.mode === "local-fallback").length;
  const failedCoreCount = coreSources.filter((source) => source.status === "failed").length;
  const coverageScore = signals.dataQuality?.coverageScore ?? 0;
  const areaRelevanceScore = signals.areaRelevance?.score ?? 100;
  const rainfall1h = rainfallWindowTotal(rainfallSeries.points, 1);
  const rainfall3h = rainfallWindowTotal(rainfallSeries.points, 3);
  const rainfall24h = rainfallWindowTotal(rainfallSeries.points, 24);
  const rainfall72h = rainfallWindowTotal(rainfallSeries.points, 72);
  const latestRainfall =
    rainfallSeries.latestValidRainfallMm ??
    (rainfallValues.length > 0 ? rainfallValues[rainfallValues.length - 1] : 0);
  const maxRecentRainfall = rainfallValues.length > 0 ? Math.max(...rainfallValues) : 0;
  const antecedentWetness = Math.max(0, rainfall72h - rainfall3h);
  const rainfallPressure = clamp(
    Math.round(
      rainfall1h * 14 + rainfall3h * 8 + rainfall24h * 3 + latestRainfall * 5 + maxRecentRainfall * 2,
    ),
  );

  let weatherPressure = 15;
  if (Number(weather.rainfallTraceMm ?? 0) > 0) weatherPressure += 15;
  if (Number(weather.cloudOktas ?? 0) >= 6) weatherPressure += 15;
  if (weather.cloudBaseM !== null && Number(weather.cloudBaseM) <= 300) weatherPressure += 10;
  if (weather.visibilityKm !== null && Number(weather.visibilityKm) <= 15) weatherPressure += 5;

  const risingCount = countByTendency(riverStations, "rising");
  const steadyCount = countByTendency(riverStations, "steady");
  const fallingCount = countByTendency(riverStations, "falling");
  const riverBaseline = buildRiverBaselineFeatures(riverStations, riverContext.primaryStation);
  const tendencyPressure = clamp(risingCount * 35 + steadyCount * 8 - fallingCount * 8);
  const riverLevelPressure =
    riverBaseline.riverHeightDeltaM === null
      ? riverStations.length > 0
        ? 20
        : 0
      : clamp(25 + riverBaseline.riverHeightDeltaM * 140);
  const riverPressure = clamp(
    Math.round(tendencyPressure * 0.55 + riverLevelPressure * 0.4 + riverStations.length * 2),
  );
  const wetnessPressure = clamp(
    Math.round(rainfall24h * 2.5 + antecedentWetness * 1.35 + maxRecentRainfall * 1.5),
  );

  const inputCoverage = [
    Boolean(weather.stationName),
    (rainfallSeries.points ?? []).length > 0,
    riverStations.length > 0,
  ].filter(Boolean).length;
  const inputCoverageScore = Math.round((inputCoverage / 3) * 100);
  const dataFreshnessScore = buildFreshnessScore(signals.sourceMetadata ?? []);
  const confidence = clamp(
    Math.round(
      coverageScore * 0.35 +
        inputCoverageScore * 0.25 +
        dataFreshnessScore * 0.3 +
        areaRelevanceScore * 0.1 -
        fallbackCoreCount * 12 -
        staleCoreCount * 14 -
        failedCoreCount * 22 -
        staleContextCount * 4,
    ),
  );
  const riskSignals = {
    rainfallPressure,
    weatherPressure: clamp(weatherPressure),
    riverPressure,
    wetnessPressure,
    publicSignalPressure: signals.publicSignalSummary?.publicSignalPressure ?? 0,
    inputCoverage: inputCoverageScore,
    confidence,
    features: {
      latestRainfallMm: latestRainfall,
      maxRecentRainfallMm: maxRecentRainfall,
      rainfall1hMm: Number(rainfall1h.toFixed(1)),
      rainfall3hMm: Number(rainfall3h.toFixed(1)),
      rainfall24hMm: Number(rainfall24h.toFixed(1)),
      rainfall72hMm: Number(rainfall72h.toFixed(1)),
      antecedentWetnessMm: Number(antecedentWetness.toFixed(1)),
      riverStationCount: riverStations.length,
      risingRiverStations: risingCount,
      steadyRiverStations: steadyCount,
      fallingRiverStations: fallingCount,
      riverTendencyPressure: Math.round(tendencyPressure),
      riverLevelPressure: Math.round(riverLevelPressure),
      ...riverBaseline,
      dataFreshnessScore,
      inputCoverage: inputCoverageScore,
      fallbackSourceCount,
      staleSourceCount,
      failedSourceCount,
      staleCoreCount,
      staleContextCount,
    },
  };
  riskSignals.features.contributingSignalCount = countContributingSignals(signals, riskSignals);

  return riskSignals;
}

export function assessRisk(signals) {
  const riskSignals = buildRiskSignals(signals);
  const areaName = signals.area?.name || signals.location?.name || "the selected area";
  const shortAreaName = areaName.replace(", NSW", "");
  const catchmentName = signals.area?.catchment || signals.riverContext?.region || "local waterways";
  const rainfall24h = riskSignals.features.rainfall24hMm;
  const rainfall72h = riskSignals.features.rainfall72hMm;
  const rainfall3h = riskSignals.features.rainfall3hMm;
  const antecedentWetness = riskSignals.features.antecedentWetnessMm;
  const risingStations = riskSignals.features.risingRiverStations;
  const publicSignalSummary = signals.publicSignalSummary ?? {};
  const reasons = [];
  const scoreComponents = buildScoreComponents(riskSignals);
  const score = Math.round(
    scoreComponents.reduce((total, component) => total + component.contribution, 0),
  );

  let concernLevel = score >= 70 ? "High" : score >= 45 ? "Moderate" : "Low";

  if (rainfall24h >= 5 || riskSignals.rainfallPressure >= 45) {
    reasons.push(`${shortAreaName} rainfall in the latest 24h window is ${rainfall24h} mm`);
  }

  if (rainfall3h >= 3) {
    reasons.push(`${shortAreaName} short-window rainfall is ${rainfall3h} mm over the latest 3h window`);
  }

  if (rainfall72h >= 10) {
    reasons.push(`${shortAreaName} rainfall in the latest 72h window is ${rainfall72h} mm`);
  }

  if (risingStations > 0) {
    reasons.push(`${risingStations} ${catchmentName} river/creek station(s) are rising`);
  }

  if (antecedentWetness >= 8) {
    reasons.push(`Antecedent wetness is ${antecedentWetness} mm across the recent multi-day window`);
  }

  if (rainfall24h >= 10 && risingStations > 0 && score >= 60) {
    concernLevel = "High";
    reasons.push(`${shortAreaName} rainfall and river signals indicate elevated local flood concern`);
  }

  if (
    score >= 40 &&
    concernLevel === "Low" &&
    Math.max(riskSignals.rainfallPressure, riskSignals.riverPressure) >= 60
  ) {
    concernLevel = "Moderate";
  }

  if (riskSignals.confidence < 80) {
    reasons.push(
      `Confidence is ${riskSignals.confidence}% because one or more sources are fallback, stale, or incomplete`,
    );
  }

  if ((publicSignalSummary.actionableReports ?? 0) > 0) {
    reasons.push(
      `${publicSignalSummary.actionableReports} unverified actionable community report(s) are included as supplementary evidence`,
    );
  }

  if (reasons.length === 0) {
    reasons.push(`${shortAreaName} rainfall and river-height signals remain below concern thresholds`);
  }

  return {
    concernLevel,
    score,
    summary:
      concernLevel === "High"
        ? `FloodGuard has identified elevated local flood concern for ${shortAreaName} from combined rainfall and river signals.`
        : concernLevel === "Moderate"
          ? `FloodGuard has identified moderate local flood concern for ${shortAreaName} using recent rainfall and ${catchmentName} river-context signals.`
          : `FloodGuard currently indicates low immediate flood concern for ${shortAreaName} while continuing to monitor rainfall and ${catchmentName} conditions.`,
    reasons,
    signals: {
      rainfallPressure: riskSignals.rainfallPressure,
      riverPressure: riskSignals.riverPressure,
      wetnessPressure: riskSignals.wetnessPressure,
      publicSignalPressure: publicSignalSummary.publicSignalPressure ?? 0,
      confidence: riskSignals.confidence,
    },
    features: riskSignals.features,
    decisionAudit: buildDecisionAudit(signals, riskSignals, score, concernLevel),
  };
}
