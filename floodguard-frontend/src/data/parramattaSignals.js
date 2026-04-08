import parramattaWeatherRaw from "./raw/parramatta-weather.json";
import northParramattaRainRaw from "./raw/north-parramatta-rain.json";

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



export const parramattaRiverData = {
  region: "Parramatta River",
  issued_date: "2026-04-09",
  source: "Latest River Heights - Central Coast (NSW)",
  stations: [
    {
      station_name: "Blacktown Creek (Int. Peace Park)",
      station_type: "Automatic",
      time_day: "01.16AM Thu",
      height_m: 0.28,
      gauge_datum: "LGH",
      tendency: "steady",
      flood_classification: null
    },
    {
      station_name: "Toongabbie Creek at Johnstons Bridge",
      station_type: "Automatic",
      time_day: "12.28AM Thu",
      height_m: 0.34,
      gauge_datum: "AHD",
      tendency: "steady",
      flood_classification: null
    },
    {
      station_name: "Toongabbie Creek at Briens Rd",
      station_type: "Automatic",
      time_day: "01.00AM Thu",
      height_m: 0.36,
      gauge_datum: "LGH",
      tendency: "steady",
      flood_classification: null
    },
    {
      station_name: "Toongabbie Creek at Redbank Road",
      station_type: "Automatic",
      time_day: "01.23AM Thu",
      height_m: 0.32,
      gauge_datum: "LGH",
      tendency: "steady",
      flood_classification: null
    },
    {
      station_name: "Darling Mills Creek at North Parramatta",
      station_type: "Automatic",
      time_day: "10.48PM Wed",
      height_m: 0.25,
      gauge_datum: "LGH",
      tendency: "steady",
      flood_classification: null
    },
    {
      station_name: "Parramatta River at Riverside Theatre",
      station_type: "Automatic",
      time_day: "11.10PM Wed",
      height_m: 1.0,
      gauge_datum: "LGH",
      tendency: "falling",
      flood_classification: null
    },
    {
      station_name: "Parramatta River at Marsden Weir",
      station_type: "Automatic",
      time_day: "01.12AM Thu",
      height_m: 0.46,
      gauge_datum: "LGH",
      tendency: "steady",
      flood_classification: null
    },
    {
      station_name: "Pendle Creek at Toongabbie",
      station_type: "Automatic",
      time_day: "01.29AM Thu",
      height_m: 0.0,
      gauge_datum: "LGH",
      tendency: "steady",
      flood_classification: null
    }
  ]
};
