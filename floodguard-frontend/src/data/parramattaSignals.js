import parramattaWeatherRaw from "./raw/parramatta-weather.json";
import northParramattaRainRaw from "./raw/north-parramatta-rain.json";

function normalizeWeather(raw) {
  const header = raw?.observations?.header?.[0] ?? {};
  const latest = raw?.observations?.data?.[0] ?? {};

  return {
    stationName: latest.name || header.name || "Parramatta",
    sourceLabel: "BoM weather observations",
    issuedAt: header.refresh_message || null,
    observedAt: latest.local_date_time_full || null,
    lat: latest.lat ?? null,
    lon: latest.lon ?? null,
    rainfallTraceMm:
      latest.rain_trace !== null && latest.rain_trace !== undefined
        ? Number(latest.rain_trace)
        : null,
    temperatureC: latest.air_temp ?? null,
    weather: latest.weather || null,
    cloud: latest.cloud || null,
    cloudBaseM: latest.cloud_base_m ?? null,
    cloudOktas: latest.cloud_oktas ?? null,
    cloudType: latest.cloud_type || null,
    visibilityKm:
      latest.vis_km !== null && latest.vis_km !== undefined
        ? Number(latest.vis_km)
        : null,
    windDirection: latest.wind_dir || null,
    windSpeedKmh: latest.wind_spd_kmh ?? null,
  };
}

function normalizeRainfall(raw) {
  const source = raw?.[0] ?? {};
  const rows = source?.data ?? [];

  const points = rows
    .map((row) => {
      const [timestamp, value, qualityCode, interpolationType] = row;

      return {
        time: timestamp,
        rainfallMm: value === null ? null : Number(value),
        qualityCode,
        interpolationType,
      };
    })
    .filter((point) => point.rainfallMm !== null);

  const latestPoint = [...points].reverse().find((p) => p.rainfallMm !== null) || null;

  return {
    stationName: source["Station Long Name"] || "North Parramatta (Burnside Homes)",
    stationNumber: source["Station Number"] || null,
    sourceLabel: "North Parramatta rainfall gauge",
    parameterType: source["Parameter Type Name"] || null,
    timeseriesName: source["Timeseries Name"] || null,
    unit: source["Unit Name"] || "millimeter",
    dataOwner: source["DATA_OWNER_NAME"] || null,
    aggregation: "Daily total",
    latestValidRainfallMm: latestPoint ? latestPoint.rainfallMm : null,
    points,
  };
}

const weatherObservations = normalizeWeather(parramattaWeatherRaw);
const rainfallSeries = normalizeRainfall(northParramattaRainRaw);

export const parramattaSignals = {
  location: {
    name: "Parramatta, NSW",
    region: "Greater Sydney",
    lat: weatherObservations.lat,
    lon: weatherObservations.lon,
  },

  snapshot: {
    riskLevel: "Moderate",
    summary:
      "FloodGuard combines public weather observations, nearby rainfall-gauge data, and local river-context inputs to support explainable flood awareness.",
  },

  weatherObservations,

  rainfallSeries,

  riverContext: {
    sourceLabel: "Latest public river-height context",
    headlineTrend: "To be added from current Parramatta river-height source",
    stations: [],
  },

  communityReports: [
    {
      id: 1,
      title: "Road flooding reported near Church Street",
      time: "1 hour ago",
      severity: "Moderate",
      description:
        "Resident reported shallow flooding across one lane with slow-moving traffic.",
    },
    {
      id: 2,
      title: "Water rising near local creek pathway",
      time: "35 mins ago",
      severity: "High",
      description:
        "Pathway near creek becoming unsafe due to rapidly rising water level.",
    },
  ],

  sourceMetadata: [
    {
      label: "Parramatta weather observations",
      type: "weather",
      note: "Current local weather observations from BoM JSON.",
    },
    {
      label: "North Parramatta rainfall gauge",
      type: "rainfall",
      note: "Nearby rainfall time series normalized from raw JSON.",
    },
  ],
};