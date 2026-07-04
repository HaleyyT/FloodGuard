import { floodFeatureThresholds, riskThresholdConfig } from "./config.js";

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

function sortPointsByTime(points = []) {
  return [...points]
    .filter((point) => point.time)
    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
}

function latestPointTime(points = []) {
  const sorted = sortPointsByTime(points);
  return sorted.at(-1)?.time ?? null;
}

function deltaOverHours(points = [], hours = 1) {
  const sorted = sortPointsByTime(points);
  const latest = sorted.at(-1) ?? null;
  if (!latest || typeof latest.heightM !== "number") return null;

  const latestMs = new Date(latest.time).getTime();
  if (Number.isNaN(latestMs)) return null;
  const cutoff = latestMs - hours * 60 * 60 * 1000;
  const baseline = [...sorted]
    .reverse()
    .find((point) => typeof point.heightM === "number" && new Date(point.time).getTime() <= cutoff);

  if (!baseline) return null;
  return latest.heightM - baseline.heightM;
}

function riverTrend(delta1h, delta3h) {
  const threshold = floodFeatureThresholds.river.steadyDeltaM;
  const strongestDelta =
    typeof delta3h === "number" && Math.abs(delta3h) >= threshold
      ? delta3h
      : typeof delta1h === "number"
        ? delta1h
        : null;

  if (strongestDelta === null) return "unknown";
  if (strongestDelta > threshold) return "rising";
  if (strongestDelta < -threshold) return "falling";
  return "steady";
}

function sourceDataMode(source) {
  return source.dataMode ?? source.mode ?? "unknown";
}

function isLiveCoreSource(source) {
  return ["primary_live_gauge", "official_backup"].includes(source.sourceStrength);
}

function isUsableCoreSource(source) {
  if (!source) return false;
  if (!isLiveCoreSource(source)) return false;
  if (source.status === "failed") return false;
  if (!["current"].includes(source.freshnessStatus)) return false;
  return !["local_demo_fallback", "cached_stale", "missing"].includes(sourceDataMode(source));
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
  // The decision audit is the explainer payload for the dashboard and future validation work.
  const components = buildScoreComponents(riskSignals);
  const reliability = buildReliability(signals, riskSignals);
  const rainfall1h = riskSignals.features.rainfall1hMm ?? 0;
  const rainfall3h = riskSignals.features.rainfall3hMm ?? 0;
  const rainfall24h = riskSignals.features.rainfall24hMm ?? 0;
  const rainfall72h = riskSignals.features.rainfall72hMm ?? 0;
  const antecedentWetness = riskSignals.features.antecedentWetnessMm ?? 0;
  const riverTrend = riskSignals.features.riverTrend ?? "unknown";
  const riverDelta1h = riskSignals.features.riverDelta1hM ?? null;
  const riverDelta3h = riskSignals.features.riverDelta3hM ?? null;
  const warningStatus = signals.warningSummary?.status ?? "not_configured";
  const warningActive = !["no_current_warning", "unknown", "not_configured"].includes(warningStatus);
  const hazardPressure = {
    rainfall:
      rainfall24h >= floodFeatureThresholds.rainfall.twentyFourHourConcernMm ||
      rainfall3h >= floodFeatureThresholds.rainfall.threeHourConcernMm
        ? "elevated"
        : riskSignals.rainfallPressure >= 35 || rainfall1h >= floodFeatureThresholds.rainfall.oneHourConcernMm
          ? "watch"
          : "low",
    river:
      (typeof riverDelta3h === "number" &&
        riverDelta3h >= floodFeatureThresholds.river.rapidRiseThreeHourM) ||
      (typeof riverDelta1h === "number" &&
        riverDelta1h >= floodFeatureThresholds.river.rapidRiseOneHourM) ||
      riverTrend === "rising"
        ? "elevated"
        : riverTrend === "steady" || ((riskSignals.features.steadyRiverStations ?? 0) > 0 && (riskSignals.features.risingRiverStations ?? 0) === 0)
          ? "stable"
          : riverTrend === "falling"
            ? "easing"
            : "limited",
    wetness:
      rainfall72h >= floodFeatureThresholds.rainfall.seventyTwoHourWetnessMm ||
      antecedentWetness >= floodFeatureThresholds.rainfall.seventyTwoHourWetnessMm / 2
        ? "moderate"
        : "low",
  };
  const evidenceConfidence =
    reliability.level === "High"
      ? "high"
      : reliability.level === "Medium"
        ? "partial"
        : "limited";
  const officialWarningContext = warningActive ? warningStatus : warningStatus ?? "not_configured";
  const increasedConcern = [];
  const reducedConcern = [];
  const sourceLimitations = [];
  const excludedEvidence = riskSignals.features.excludedSignals ?? [];

  if (hazardPressure.rainfall === "elevated") {
    increasedConcern.push(
      `Recent rainfall is elevated with ${rainfall3h} mm over 3h and ${rainfall24h} mm over 24h.`,
    );
  } else if (hazardPressure.rainfall === "watch") {
    increasedConcern.push(`Short-window rainfall is elevated at ${rainfall1h} mm in the last hour.`);
  } else {
    reducedConcern.push("Rainfall remains below the stronger concern windows.");
  }

  if (hazardPressure.river === "elevated") {
    increasedConcern.push(
      `River trend is rising with ${riverDelta1h ?? "unknown"} m over 1h and ${riverDelta3h ?? "unknown"} m over 3h.`,
    );
  } else if (hazardPressure.river === "stable") {
    reducedConcern.push("River trend is stable, which lowers immediate local concern.");
  } else if (hazardPressure.river === "easing") {
    reducedConcern.push("River trend is easing rather than rising.");
  }

  if (hazardPressure.wetness === "moderate") {
    increasedConcern.push(
      `Antecedent wetness remains elevated with ${rainfall72h} mm over 72h.`,
    );
  } else {
    reducedConcern.push("Recent multi-day wetness is not yet at the higher flood-pressure range.");
  }

  if (warningActive) {
    increasedConcern.push("An official warning context is present and should be checked separately.");
  } else if (officialWarningContext === "not_configured") {
    sourceLimitations.push("Official warning feed is not connected yet, so FloodGuard cannot verify warning context automatically.");
  } else if (officialWarningContext === "source_unavailable") {
    sourceLimitations.push("Official warning source is currently unavailable.");
  } else {
    reducedConcern.push("No current relevant official warning is attached to this area snapshot.");
  }

  sourceLimitations.push(...reliability.blockers, ...reliability.warnings);

  const recommendationType =
    concernLevel === "High"
      ? "prepare_to_act_and_check_official_sources"
      : concernLevel === "Moderate"
        ? "monitor_and_check_official_sources"
        : evidenceConfidence === "limited"
          ? "monitor_with_caution_due_to_limited_evidence"
          : "continue_monitoring";
  const checkNext = [
    "Check official NSW SES and BoM advice.",
    concernLevel !== "Low"
      ? "Avoid floodwater and low-lying routes if conditions worsen."
      : "Monitor local rainfall and river trends.",
    "Prepare to act according to official emergency advice.",
  ];
  const decisionSummary = {
    primaryConcernDriver:
      increasedConcern[0] ??
      reducedConcern[0] ??
      "Current concern is being driven by combined rainfall, river, and reliability context.",
    primaryReliabilityMessage:
      sourceLimitations[0] ??
      `Evidence confidence is ${evidenceConfidence}, based on current source freshness and coverage.`,
    recommendedUserFocus: checkNext[0] ?? "Check official NSW SES and BoM advice.",
    whyThisMatters:
      concernLevel === "High"
        ? "FloodGuard sees elevated local pressure, but official emergency advice remains primary."
        : concernLevel === "Moderate"
          ? "FloodGuard sees conditions worth monitoring closely, especially alongside official updates."
          : "FloodGuard currently sees lower local pressure, but still tracks changing rainfall and river conditions.",
  };

  return {
    contractVersion: "risk-intelligence-v2",
    concernLevel,
    score,
    hazardPressure,
    evidenceConfidence,
    officialWarningContext,
    recommendationType,
    decisionSummary,
    decisionRecommendation: {
      recommendationType,
      nextSteps: checkNext,
      note:
        recommendationType === "prepare_to_act_and_check_official_sources"
          ? "FloodGuard indicates elevated local concern, but official emergency advice remains primary."
          : recommendationType === "monitor_and_check_official_sources"
            ? "Conditions warrant monitoring and checking official sources rather than relying on FloodGuard alone."
            : "FloodGuard remains conservative and keeps official sources primary for any emergency action.",
    },
    scoreFormula: "rainfall 35% + river 30% + wetness 18% + weather 10% + public signals 7%",
    thresholds: {
      moderate: 45,
      high: 70,
      thresholdConfigVersion: riskThresholdConfig.version ?? "unknown",
      thresholdReviewStatus: riskThresholdConfig.reviewStatus ?? "unknown",
    },
    components,
    reliability,
    whatIncreasedConcern: increasedConcern,
    whatReducedConcern: reducedConcern,
    excludedEvidence,
    sourceLimitations,
    checkNext,
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

function buildNotificationEligibility(signals, concernLevel) {
  // Risk scoring and notification permission are related but not identical, so high risk can still block strong app alerts.
  const coreStatus = signals.ingestionHealth?.coreFloodStatus ?? "unknown";
  const overallStatus = signals.ingestionHealth?.overallStatus ?? "unknown";
  const hasOfficialWarning = !["no_current_warning", "unknown"].includes(
    signals.warningSummary?.status ?? "unknown",
  );
  const strongAppAlertEligible = coreStatus === "pass";

  return {
    notificationType:
      hasOfficialWarning
        ? "official_warning"
        : concernLevel === "High"
          ? "risk_escalation"
          : concernLevel === "Moderate"
            ? "awareness_notice"
            : "none",
    strongAppAlertEligible,
    officialWarningEligible: hasOfficialWarning,
    sourceStatus: overallStatus,
    reason: strongAppAlertEligible
      ? "Core live gauges are current enough for app-generated awareness notifications."
      : "Core live gauges are degraded, so strong app-generated escalation should be suppressed.",
  };
}

export function buildRiskSignals(signals) {
  // Core flood features only use sources that pass the live-gauge reliability bar; degraded core sources are zeroed out and explained later.
  const weather = signals.weatherObservations ?? {};
  const rainfallSource = (signals.sourceMetadata ?? []).find((source) => source.type === "rainfall") ?? null;
  const riverSource = (signals.sourceMetadata ?? []).find((source) => source.type === "river") ?? null;
  const usableRainfall = isUsableCoreSource(rainfallSource);
  const usableRiver = isUsableCoreSource(riverSource);
  const rainfallSeries = usableRainfall ? signals.rainfallSeries ?? {} : { points: [], latestValidRainfallMm: 0 };
  const riverContext = usableRiver ? signals.riverContext ?? {} : { stations: [], primaryStation: null };
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
  const fallbackCoreCount = coreSources.filter((source) =>
    ["local-fallback", "local_demo_fallback"].includes(sourceDataMode(source)),
  ).length;
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
  const primaryRiverPoints = riverContext.primaryStation?.points ?? [];
  const riverDelta1h = deltaOverHours(primaryRiverPoints, 1);
  const riverDelta3h = deltaOverHours(primaryRiverPoints, 3);
  const latestRiverPointTime = latestPointTime(primaryRiverPoints);
  const computedRiverTrend = riverTrend(riverDelta1h, riverDelta3h);
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
  const trendPressure = clamp(
    Math.round(
      Math.max(riverDelta1h ?? 0, 0) * 180 +
        Math.max(riverDelta3h ?? 0, 0) * 120 +
        (computedRiverTrend === "rising" ? 18 : computedRiverTrend === "falling" ? -10 : 0),
    ),
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

  // Confidence is separate from risk and answers how much we trust the evidence behind this snapshot.
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
      wetnessIndex: Number(
        Math.min(
          1,
          antecedentWetness / Math.max(1, floodFeatureThresholds.rainfall.seventyTwoHourWetnessMm),
        ).toFixed(3),
      ),
      riverStationCount: riverStations.length,
      riverLatestM:
        typeof riverBaseline.primaryRiverHeightM === "number" ? riverBaseline.primaryRiverHeightM : null,
      riverDelta1hM: roundNumber(riverDelta1h, 3),
      riverDelta3hM: roundNumber(riverDelta3h, 3),
      riverTrend: computedRiverTrend,
      riverLatestObservedAt: latestRiverPointTime,
      risingRiverStations: risingCount,
      steadyRiverStations: steadyCount,
      fallingRiverStations: fallingCount,
      riverTendencyPressure: Math.round(tendencyPressure),
      riverLevelPressure: Math.round(riverLevelPressure),
      trendPressure,
      ...riverBaseline,
      dataFreshnessScore,
      freshnessScore: Number((dataFreshnessScore / 100).toFixed(3)),
      inputCoverage: inputCoverageScore,
      sourceCoverage: Number((coverageScore / 100).toFixed(3)),
      fallbackSourceCount,
      staleSourceCount,
      failedSourceCount,
      staleCoreCount,
      staleContextCount,
    },
  };
  riskSignals.features.excludedSignals = [
    !usableRainfall && rainfallSource
      ? `${rainfallSource.label} excluded from live core scoring (${rainfallSource.freshnessStatus}, ${sourceDataMode(
          rainfallSource,
        )}, ${rainfallSource.sourceStrength})`
      : null,
    !usableRiver && riverSource
      ? `${riverSource.label} excluded from live core scoring (${riverSource.freshnessStatus}, ${sourceDataMode(
          riverSource,
        )}, ${riverSource.sourceStrength})`
      : null,
  ].filter(Boolean);
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

  for (const excludedSignal of riskSignals.features.excludedSignals ?? []) {
    reasons.push(excludedSignal);
  }

  const decisionAudit = buildDecisionAudit(signals, riskSignals, score, concernLevel);

  return {
    contractVersion: decisionAudit.contractVersion,
    concernLevel,
    score,
    hazardPressure: decisionAudit.hazardPressure,
    evidenceConfidence: decisionAudit.evidenceConfidence,
    officialWarningContext: decisionAudit.officialWarningContext,
    recommendationType: decisionAudit.recommendationType,
    decisionSummary: decisionAudit.decisionSummary,
    decisionRecommendation: decisionAudit.decisionRecommendation,
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
    pressureScores: {
      rainfallPressure: Number((riskSignals.rainfallPressure / 100).toFixed(3)),
      riverPressure: Number((riskSignals.riverPressure / 100).toFixed(3)),
      wetnessPressure: Number((riskSignals.wetnessPressure / 100).toFixed(3)),
      trendPressure: Number(((riskSignals.features.trendPressure ?? 0) / 100).toFixed(3)),
      confidence: Number((riskSignals.confidence / 100).toFixed(3)),
    },
    excludedSignals: riskSignals.features.excludedSignals ?? [],
    decisionAudit,
    notificationEligibility: buildNotificationEligibility(signals, concernLevel),
  };
}
