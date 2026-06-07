function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function validRainfallValues(points = []) {
  return points
    .map((point) => point.rainfallMm)
    .filter((value) => typeof value === "number" && !Number.isNaN(value));
}

export function buildRiskSignals(signals) {
  const weather = signals.weatherObservations ?? {};
  const rainfallSeries = signals.rainfallSeries ?? {};
  const riverContext = signals.riverContext ?? {};
  const rainfallValues = validRainfallValues(rainfallSeries.points);
  const riverStations = riverContext.stations ?? [];

  const latestRainfall =
    rainfallSeries.latestValidRainfallMm ??
    (rainfallValues.length > 0 ? rainfallValues[rainfallValues.length - 1] : 0);
  const maxRecentRainfall = rainfallValues.length > 0 ? Math.max(...rainfallValues) : 0;

  const rainfallPressure = clamp(Math.round(latestRainfall * 4 + maxRecentRainfall * 3));

  let weatherPressure = 15;
  if (Number(weather.rainfallTraceMm ?? 0) > 0) weatherPressure += 15;
  if (Number(weather.cloudOktas ?? 0) >= 6) weatherPressure += 15;
  if (weather.cloudBaseM !== null && Number(weather.cloudBaseM) <= 300) weatherPressure += 10;
  if (weather.visibilityKm !== null && Number(weather.visibilityKm) <= 15) weatherPressure += 5;

  const risingCount = riverStations.filter(
    (station) => station.tendency?.toLowerCase() === "rising",
  ).length;
  const steadyCount = riverStations.filter(
    (station) => station.tendency?.toLowerCase() === "steady",
  ).length;
  const riverPressure = clamp(20 + risingCount * 25 + steadyCount * 8);

  const inputCoverage = [
    Boolean(weather.stationName),
    (rainfallSeries.points ?? []).length > 0,
    riverStations.length > 0,
  ].filter(Boolean).length;

  return {
    rainfallPressure,
    weatherPressure: clamp(weatherPressure),
    riverPressure,
    inputCoverage: Math.round((inputCoverage / 3) * 100),
  };
}

export function assessRisk(signals) {
  const riskSignals = buildRiskSignals(signals);
  const areaName = signals.area?.name || signals.location?.name || "the selected area";
  const shortAreaName = areaName.replace(", NSW", "");
  const catchmentName = signals.area?.catchment || signals.riverContext?.region || "local waterways";
  const latestRain = signals.rainfallSeries?.latestValidRainfallMm ?? 0;
  const risingStations = signals.riverContext?.tendencyCounts?.rising ?? 0;
  const reasons = [];

  let concernLevel = "Low";

  if (latestRain >= 5 || riskSignals.rainfallPressure >= 50) {
    concernLevel = "Moderate";
    reasons.push(`${shortAreaName} rainfall signal recorded: ${latestRain} mm`);
  }

  if (risingStations > 0) {
    concernLevel = "Moderate";
    reasons.push(`${risingStations} ${catchmentName} river/creek station(s) are rising`);
  }

  if (latestRain >= 10 && risingStations > 0) {
    concernLevel = "High";
    reasons.push(`${shortAreaName} rainfall and river signals indicate elevated local flood concern`);
  }

  if (reasons.length === 0) {
    reasons.push(`${shortAreaName} rainfall and river-height signals remain below concern thresholds`);
  }

  return {
    concernLevel,
    summary:
      concernLevel === "High"
        ? `FloodGuard has identified elevated local flood concern for ${shortAreaName} from combined rainfall and river signals.`
        : concernLevel === "Moderate"
          ? `FloodGuard has identified moderate local flood concern for ${shortAreaName} using recent rainfall and ${catchmentName} river-context signals.`
          : `FloodGuard currently indicates low immediate flood concern for ${shortAreaName} while continuing to monitor rainfall and ${catchmentName} conditions.`,
    reasons,
    signals: riskSignals,
  };
}
