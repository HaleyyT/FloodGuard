import parramattaWeatherRaw from "./raw/parramatta-weather.json";
import northParramattaRainRaw from "./raw/north-parramatta-rain.json";
import parramattaRiverRaw from "./raw/parramattaRiverData.json";


//create a river normalisation helper
function normalizeRiverContext(raw) {
  const stations = (raw?.stations ?? []).map((station) => ({
    stationName: station.station_name,
    stationType: station.station_type,
    timeDay: station.time_day,
    heightM: station.height_m,
    gaugeDatum: station.gauge_datum,
    tendency: station.tendency,
    statusLabel: station.tendency
      ? station.tendency.charAt(0).toUpperCase() + station.tendency.slice(1)
      : "Unknown",
    floodClassification: station.flood_classification,
  }));

  const primaryStation =
    stations.find((station) =>
      station.stationName.includes("Parramatta River at Riverside Theatre")
    ) ||
    stations.find((station) =>
      station.stationName.includes("Parramatta River")
    ) ||
    stations[0] ||
    null;

  const risingCount = stations.filter(
    (station) => station.tendency?.toLowerCase() === "rising"
  ).length;

  const fallingCount = stations.filter(
    (station) => station.tendency?.toLowerCase() === "falling"
  ).length;

  const steadyCount = stations.filter(
    (station) => station.tendency?.toLowerCase() === "steady"
  ).length;

  let headlineTrend = "No river data available";

  if (primaryStation) {
    headlineTrend = `${primaryStation.statusLabel} at ${primaryStation.stationName}`;
  }

  return {
    sourceLabel: raw?.source || "Latest public river-height context",
    issuedDate: raw?.issued_date || null,
    region: raw?.region || "Parramatta River",
    headlineTrend,
    stationCount: stations.length,
    tendencyCounts: {
      rising: risingCount,
      falling: fallingCount,
      steady: steadyCount,
    },
    primaryStation,
    stations,
  };
}



// Normalises the raw BoM weather observations JSON into a consistent format for the signal cards, extracting key parameters such as temperature, rainfall trace, cloud conditions, visibility, and wind information.
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
const riverContext = normalizeRiverContext(parramattaRiverRaw);

export const parramattaSignals = {
  location: {
    name: "Parramatta, NSW",
    region: "Greater Sydney",
    lat: weatherObservations.lat,
    lon: weatherObservations.lon,
  },

  snapshot: {
    riskLevel: "Low",
    summary:
      "FloodGuard currently indicates low immediate flood concern while continuing to monitor rainfall and river conditions.",
  },

  weatherObservations,
  rainfallSeries,
  riverContext,

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
    {
      label: "Parramatta river context",
      type: "river",
      note: "Current local river and creek heights normalized from public river-height data.",
    },
  ],
};


/* Helper functions to format signal times and extract relevant rainfall points for the signal cards.
these functions ensure that the displayed information is clear, providing context for the timing and severity of the signals presented in the public signal cards.*/
function formatSignalTime(value, fallback = "Latest update") {
  if (!value) return fallback;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;

  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  });
}

function getLatestRainfallPoint(points = []) {
  const valid = points.filter(
    (point) => typeof point.rainfallMm === "number" && !Number.isNaN(point.rainfallMm)
  );
  return valid.length > 0 ? valid[valid.length - 1] : null;
}

function getMaxRainfallPoint(points = []) {
  const valid = points.filter(
    (point) => typeof point.rainfallMm === "number" && !Number.isNaN(point.rainfallMm)
  );
  if (valid.length === 0) return null;

  return valid.reduce((maxPoint, point) =>
    point.rainfallMm > maxPoint.rainfallMm ? point : maxPoint
  );
}


/* Builds an array of signal cards based on the available signals, prioritising weather, rainfall, and river context updates. 
/Each card includes a title, time, severity level, and description to provide users with clear and actionable information about current flood-related conditions in Parramatta.*/
export function buildPublicSignalCards(signals) {
  const cards = [];

  const weather = signals.weatherObservations ?? {};
  const rainfall = signals.rainfallSeries ?? {};
  const river = signals.riverContext ?? {};

  if (weather.stationName) {
    const weatherSeverity =
      (weather.rainfallTraceMm ?? 0) > 0 || (weather.cloudOktas ?? 0) >= 6
        ? "Moderate"
        : "Low";

    cards.push({
      id: 1,
      title: "Parramatta weather observation update",
      time: formatSignalTime(weather.observedAt, "Latest observation"),
      severity: weatherSeverity,
      description: `Observed ${weather.cloud?.toLowerCase() || "weather conditions"} with ${weather.visibilityKm ?? "unknown"} km visibility, ${weather.windDirection || "variable"} wind at ${weather.windSpeedKmh ?? "unknown"} km/h, and a rain trace of ${weather.rainfallTraceMm ?? 0} mm.`,
    });
  }

  if ((rainfall.points ?? []).length > 0) {
    const latestPoint = getLatestRainfallPoint(rainfall.points);
    const maxPoint = getMaxRainfallPoint(rainfall.points);

    const rainfallSeverity =
      maxPoint && maxPoint.rainfallMm >= 10
        ? "Moderate"
        : maxPoint && maxPoint.rainfallMm > 0
        ? "Low"
        : "Low";

    cards.push({
      id: 2,
      title: "North Parramatta rainfall gauge update",
      time: latestPoint
        ? formatSignalTime(latestPoint.time, "Latest gauge update")
        : "Latest gauge update",
      severity: rainfallSeverity,
      description: maxPoint
        ? `Nearby rainfall gauge data shows a recent maximum of ${maxPoint.rainfallMm.toFixed(
            1
          )} mm on ${formatSignalTime(maxPoint.time)} across the selected daily series.`
        : "Nearby rainfall gauge data has been ingested for the selected daily series.",
    });
  }

  if ((river.stations ?? []).length > 0) {
    const risingStations = river.stations.filter(
      (station) => station.tendency?.toLowerCase() === "rising"
    );
    const steadyStations = river.stations.filter(
      (station) => station.tendency?.toLowerCase() === "steady"
    );

    const riverSeverity = risingStations.length > 0 ? "Moderate" : "Low";

    cards.push({
      id: 3,
      title: "Parramatta river context update",
      time: "Latest river-height context",
      severity: riverSeverity,
      description:
        risingStations.length > 0
          ? `Current river context includes ${risingStations.length} station${
              risingStations.length > 1 ? "s" : ""
            } with rising tendency and ${steadyStations.length} steady station${
              steadyStations.length !== 1 ? "s" : ""
            }.`
          : `Current river context shows ${steadyStations.length} steady station${
              steadyStations.length !== 1 ? "s" : ""
            } and no rising tendency in the ingested stations.`,
    });
  }

  return cards;
}

export const publicSignalCards = buildPublicSignalCards(parramattaSignals);
