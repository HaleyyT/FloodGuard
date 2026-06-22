function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
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
      weight: 0.2,
    },
    {
      label: "Weather pressure",
      value: riskSignals.weatherPressure,
      weight: 0.15,
    },
  ].map((component) => ({
    ...component,
    contribution: Number((component.value * component.weight).toFixed(1)),
  }));
}

function buildReliability(signals, riskSignals) {
  const areaRelevanceScore = signals.areaRelevance?.score ?? 100;
  const coverageScore = signals.dataQuality?.coverageScore ?? 0;
  const reliabilityScore = clamp(
    Math.round(riskSignals.confidence * 0.55 + areaRelevanceScore * 0.25 + coverageScore * 0.2),
  );
  const warnings = [];
  const blockers = [];

  if ((signals.freshness?.staleSourceCount ?? 0) > 0) {
    warnings.push(`${signals.freshness.staleSourceCount} stale source(s) reduce decision reliability`);
  }

  if ((signals.freshness?.fallbackSourceCount ?? 0) > 0) {
    warnings.push(`${signals.freshness.fallbackSourceCount} source(s) are using fallback data`);
  }

  if ((signals.freshness?.failedSourceCount ?? 0) > 0) {
    blockers.push(`${signals.freshness.failedSourceCount} source(s) failed during ingestion`);
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
    scoreFormula: "rainfall 35% + river 30% + wetness 20% + weather 15%",
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
  const coverageScore = signals.dataQuality?.coverageScore ?? 0;
  const rainfall24h = rainfallWindowTotal(rainfallSeries.points, 24);
  const rainfall72h = rainfallWindowTotal(rainfallSeries.points, 72);
  const latestRainfall =
    rainfallSeries.latestValidRainfallMm ??
    (rainfallValues.length > 0 ? rainfallValues[rainfallValues.length - 1] : 0);
  const maxRecentRainfall = rainfallValues.length > 0 ? Math.max(...rainfallValues) : 0;
  const rainfallPressure = clamp(
    Math.round(rainfall24h * 8 + maxRecentRainfall * 3 + latestRainfall * 4),
  );

  let weatherPressure = 15;
  if (Number(weather.rainfallTraceMm ?? 0) > 0) weatherPressure += 15;
  if (Number(weather.cloudOktas ?? 0) >= 6) weatherPressure += 15;
  if (weather.cloudBaseM !== null && Number(weather.cloudBaseM) <= 300) weatherPressure += 10;
  if (weather.visibilityKm !== null && Number(weather.visibilityKm) <= 15) weatherPressure += 5;

  const risingCount = countByTendency(riverStations, "rising");
  const steadyCount = countByTendency(riverStations, "steady");
  const fallingCount = countByTendency(riverStations, "falling");
  const riverPressure = clamp(20 + risingCount * 30 + steadyCount * 7 - fallingCount * 5);
  const wetnessPressure = clamp(Math.round(rainfall72h * 5 + maxRecentRainfall * 2));

  const inputCoverage = [
    Boolean(weather.stationName),
    (rainfallSeries.points ?? []).length > 0,
    riverStations.length > 0,
  ].filter(Boolean).length;
  const confidence = clamp(
    coverageScore - fallbackSourceCount * 18 - staleSourceCount * 22 - failedSourceCount * 30,
  );

  return {
    rainfallPressure,
    weatherPressure: clamp(weatherPressure),
    riverPressure,
    wetnessPressure,
    inputCoverage: Math.round((inputCoverage / 3) * 100),
    confidence,
    features: {
      latestRainfallMm: latestRainfall,
      maxRecentRainfallMm: maxRecentRainfall,
      rainfall24hMm: Number(rainfall24h.toFixed(1)),
      rainfall72hMm: Number(rainfall72h.toFixed(1)),
      riverStationCount: riverStations.length,
      risingRiverStations: risingCount,
      steadyRiverStations: steadyCount,
      fallingRiverStations: fallingCount,
      fallbackSourceCount,
      staleSourceCount,
      failedSourceCount,
    },
  };
}

export function assessRisk(signals) {
  const riskSignals = buildRiskSignals(signals);
  const areaName = signals.area?.name || signals.location?.name || "the selected area";
  const shortAreaName = areaName.replace(", NSW", "");
  const catchmentName = signals.area?.catchment || signals.riverContext?.region || "local waterways";
  const rainfall24h = riskSignals.features.rainfall24hMm;
  const rainfall72h = riskSignals.features.rainfall72hMm;
  const risingStations = riskSignals.features.risingRiverStations;
  const publicSignalSummary = signals.publicSignalSummary ?? {};
  const reasons = [];
  const scoreComponents = buildScoreComponents(riskSignals);
  const score = Math.round(
    scoreComponents.reduce((total, component) => total + component.contribution, 0),
  );

  let concernLevel = score >= 70 ? "High" : score >= 45 ? "Moderate" : "Low";

  if (rainfall24h >= 5 || riskSignals.rainfallPressure >= 45) {
    concernLevel = concernLevel === "Low" ? "Moderate" : concernLevel;
    reasons.push(`${shortAreaName} rainfall in the latest 24h window is ${rainfall24h} mm`);
  }

  if (rainfall72h >= 10) {
    concernLevel = concernLevel === "Low" ? "Moderate" : concernLevel;
    reasons.push(`${shortAreaName} rainfall in the latest 72h window is ${rainfall72h} mm`);
  }

  if (risingStations > 0) {
    concernLevel = concernLevel === "Low" ? "Moderate" : concernLevel;
    reasons.push(`${risingStations} ${catchmentName} river/creek station(s) are rising`);
  }

  if (rainfall24h >= 10 && risingStations > 0) {
    concernLevel = "High";
    reasons.push(`${shortAreaName} rainfall and river signals indicate elevated local flood concern`);
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
