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
  const reasons = [];
  const score = Math.round(
    riskSignals.rainfallPressure * 0.35 +
      riskSignals.riverPressure * 0.3 +
      riskSignals.wetnessPressure * 0.2 +
      riskSignals.weatherPressure * 0.15,
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
      confidence: riskSignals.confidence,
    },
    features: riskSignals.features,
  };
}
