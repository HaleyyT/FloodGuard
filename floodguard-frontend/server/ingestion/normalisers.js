function toNumber(value) {
  if (value === null || value === undefined || value === "-") return null;

  const numberValue = Number(value);
  return Number.isNaN(numberValue) ? null : numberValue;
}

function normaliseStatusLabel(value) {
  if (!value) return "Unknown";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function normalizeWeather(raw) {
  const header = raw?.observations?.header?.[0] ?? {};
  const latest = raw?.observations?.data?.[0] ?? {};

  return {
    stationName: latest.name || header.name || "Parramatta",
    sourceLabel: "BoM weather observations",
    issuedAt: header.refresh_message || null,
    observedAt: latest.local_date_time_full || null,
    lat: toNumber(latest.lat),
    lon: toNumber(latest.lon),
    rainfallTraceMm: toNumber(latest.rain_trace),
    temperatureC: toNumber(latest.air_temp),
    weather: latest.weather || null,
    cloud: latest.cloud || null,
    cloudBaseM: toNumber(latest.cloud_base_m),
    cloudOktas: toNumber(latest.cloud_oktas),
    cloudType: latest.cloud_type || null,
    visibilityKm: toNumber(latest.vis_km),
    windDirection: latest.wind_dir || null,
    windSpeedKmh: toNumber(latest.wind_spd_kmh),
  };
}

export function normalizeRainfall(raw) {
  const source = raw?.[0] ?? {};
  const rows = source?.data ?? [];

  const points = rows
    .map((row) => {
      const [timestamp, value, qualityCode, interpolationType] = row;

      return {
        time: timestamp,
        rainfallMm: toNumber(value),
        qualityCode,
        interpolationType,
      };
    })
    .filter((point) => point.rainfallMm !== null);

  const latestPoint = [...points].reverse().find((point) => point.rainfallMm !== null) || null;

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

export function normalizeRiverContext(raw) {
  const stations = (raw?.stations ?? []).map((station) => ({
    stationName: station.station_name,
    stationType: station.station_type,
    timeDay: station.time_day,
    heightM: toNumber(station.height_m),
    gaugeDatum: station.gauge_datum,
    tendency: station.tendency,
    statusLabel: normaliseStatusLabel(station.tendency),
    floodClassification: station.flood_classification,
  }));

  const primaryStation =
    stations.find((station) =>
      station.stationName?.includes("Parramatta River at Riverside Theatre"),
    ) ||
    stations.find((station) => station.stationName?.includes("Parramatta River")) ||
    stations[0] ||
    null;

  const tendencyCounts = stations.reduce(
    (counts, station) => {
      const tendency = station.tendency?.toLowerCase();
      if (tendency === "rising") counts.rising += 1;
      else if (tendency === "falling") counts.falling += 1;
      else counts.steady += 1;
      return counts;
    },
    { rising: 0, falling: 0, steady: 0 },
  );

  return {
    sourceLabel: raw?.source || "Latest public river-height context",
    issuedDate: raw?.issued_date || null,
    region: raw?.region || "Parramatta River",
    headlineTrend: primaryStation
      ? `${primaryStation.statusLabel} at ${primaryStation.stationName}`
      : "No river data available",
    stationCount: stations.length,
    tendencyCounts,
    primaryStation,
    stations,
  };
}
