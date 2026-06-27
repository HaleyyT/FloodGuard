function toNumber(value) {
  if (value === null || value === undefined || value === "-") return null;

  const numberValue = Number(value);
  return Number.isNaN(numberValue) ? null : numberValue;
}

function normaliseStatusLabel(value) {
  if (!value) return "Unknown";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function parseBomLocalTimestamp(value) {
  if (!value || value.length < 14) return null;

  const year = value.slice(0, 4);
  const month = value.slice(4, 6);
  const day = value.slice(6, 8);
  const hour = value.slice(8, 10);
  const minute = value.slice(10, 12);
  const second = value.slice(12, 14);

  return `${year}-${month}-${day}T${hour}:${minute}:${second}+10:00`;
}

function normaliseWarningLevel(value) {
  const level = String(value || "none").toLowerCase().replaceAll(" ", "_").replaceAll("-", "_");

  if (["emergency_warning", "emergency"].includes(level)) return "emergency_warning";
  if (["watch_and_act", "watch"].includes(level)) return "watch_and_act";
  if (["advice", "minor", "moderate", "major"].includes(level)) return "advice";
  if (["all_clear", "none", "no_current_warning", "not_current"].includes(level)) {
    return "no_current_warning";
  }

  return "unknown";
}

function warningSeverityScore(level) {
  if (level === "emergency_warning") return 100;
  if (level === "watch_and_act") return 75;
  if (level === "advice") return 45;
  if (level === "unknown") return 20;
  return 0;
}

function warningMatchesArea(warning, area) {
  const areaIds = warning.areaIds ?? warning.area_ids ?? [];
  const areas = warning.areas ?? warning.locations ?? warning.suburbs ?? [];
  const text = [
    warning.area,
    warning.location,
    warning.title,
    warning.headline,
    warning.description,
    ...areas,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    areaIds.includes(area.id) ||
    text.includes(area.id.replaceAll("-", " ")) ||
    text.includes(area.name.toLowerCase().replace(", nsw", "")) ||
    text.includes(area.catchment.toLowerCase())
  );
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

export function normalizeOfficialWarnings(raw, area) {
  const warnings = Array.isArray(raw?.warnings)
    ? raw.warnings
    : Array.isArray(raw?.features)
      ? raw.features.map((feature) => feature.properties ?? feature)
      : [];
  const matchedWarnings = warnings.filter((warning) => warningMatchesArea(warning, area));
  const globalLevel = normaliseWarningLevel(raw?.status ?? raw?.level ?? raw?.warningLevel);
  const matchedLevel = matchedWarnings
    .map((warning) => normaliseWarningLevel(warning.level ?? warning.status ?? warning.warningLevel))
    .sort((a, b) => warningSeverityScore(b) - warningSeverityScore(a))[0];
  const level = matchedLevel ?? globalLevel;
  const observedAt =
    raw?.observedAt ??
    raw?.issuedAt ??
    raw?.updatedAt ??
    matchedWarnings[0]?.issuedAt ??
    matchedWarnings[0]?.updatedAt ??
    null;

  return {
    sourceLabel: raw?.sourceLabel ?? raw?.provider ?? "NSW SES / HazardWatch warning status",
    provider: raw?.provider ?? "NSW SES / HazardWatch",
    status: level,
    statusLabel:
      level === "no_current_warning"
        ? "No current warning"
        : level
            .split("_")
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" "),
    observedAt,
    issuedAt: raw?.issuedAt ?? raw?.updatedAt ?? null,
    warningCount: matchedWarnings.length,
    warnings: matchedWarnings.map((warning) => ({
      id: warning.id ?? warning.identifier ?? warning.url ?? warning.headline,
      headline: warning.headline ?? warning.title ?? "Official warning",
      level: normaliseWarningLevel(warning.level ?? warning.status ?? warning.warningLevel),
      issuedAt: warning.issuedAt ?? warning.updatedAt ?? null,
      area: warning.area ?? warning.location ?? area.name,
      url: warning.url ?? raw?.sourceUrl ?? null,
    })),
  };
}

export function normalizeWeatherRainfall(raw) {
  const header = raw?.observations?.header?.[0] ?? {};
  const latest = raw?.observations?.data?.[0] ?? {};
  const rows = raw?.observations?.data ?? [];

  const points = rows
    .map((row) => ({
      time: parseBomLocalTimestamp(row.local_date_time_full),
      rainfallMm: toNumber(row.rain_trace),
      qualityCode: null,
      interpolationType: null,
    }))
    .filter((point) => point.time && point.rainfallMm !== null)
    .reverse();

  const latestPoint = points.at(-1) ?? null;

  return {
    stationName: latest.name || header.name || "Parramatta",
    stationNumber: latest.wmo ? String(latest.wmo) : null,
    sourceLabel: "BoM Parramatta rain trace observations",
    parameterType: "Rainfall trace",
    timeseriesName: "BoM latest weather observations",
    unit: "millimeter",
    dataOwner: "Bureau of Meteorology",
    aggregation: "Observation rain trace",
    latestValidRainfallMm: latestPoint ? latestPoint.rainfallMm : null,
    points,
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

export function normalizeFloodSmartRainfall(raw) {
  const stations = (raw?.stations ?? []).map((station) => {
    const points = (station.events ?? [])
      .map((event) => ({
        time: event.time,
        rainfallMm: toNumber(event.value),
        qualityCode: event.validationCode || null,
        interpolationType: null,
      }))
      .filter((point) => point.time && point.rainfallMm !== null)
      .reverse();
    const latestPoint = points.at(-1) ?? null;

    return {
      stationName: station.stationName,
      stationNumber: station.code,
      sourceLabel: "City of Parramatta FloodSmart rainfall gauge",
      parameterType: station.parameter,
      timeseriesName: station.timeseriesUrl,
      unit: station.unit ?? "mm",
      dataOwner: raw.provider,
      aggregation: "5 minute gauge observations",
      latestValidRainfallMm: latestPoint ? latestPoint.rainfallMm : toNumber(station.latestValue),
      points:
        points.length > 0
          ? points
          : [
              {
                time: station.observedAt,
                rainfallMm: toNumber(station.latestValue),
                qualityCode: null,
                interpolationType: null,
              },
            ].filter((point) => point.time && point.rainfallMm !== null),
    };
  });
  const primaryStation = stations[0] ?? null;

  return {
    stationName: primaryStation?.stationName ?? "City of Parramatta FloodSmart rainfall gauges",
    stationNumber: primaryStation?.stationNumber ?? null,
    sourceLabel: "City of Parramatta FloodSmart rainfall gauges",
    parameterType: primaryStation?.parameterType ?? "Precipitation",
    timeseriesName: primaryStation?.timeseriesName ?? null,
    unit: primaryStation?.unit ?? "mm",
    dataOwner: raw?.provider ?? "City of Parramatta FloodSmart",
    aggregation: "5 minute gauge observations",
    latestValidRainfallMm: primaryStation?.latestValidRainfallMm ?? null,
    points: primaryStation?.points ?? [],
    stations,
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

export function normalizeFloodSmartRiverContext(raw) {
  const stations = (raw?.stations ?? []).map((station) => {
    const [latestEvent, previousEvent] = station.events ?? [];
    const latestValue = toNumber(latestEvent?.value ?? station.latestValue);
    const previousValue = toNumber(previousEvent?.value);
    const delta = latestValue !== null && previousValue !== null ? latestValue - previousValue : 0;
    const tendency = delta > 0.01 ? "rising" : delta < -0.01 ? "falling" : "steady";
    const points = (station.events ?? [])
      .map((event) => ({
        time: event.time,
        heightM: toNumber(event.value),
        qualityCode: event.validationCode || null,
      }))
      .filter((point) => point.time && point.heightM !== null);

    return {
      stationName: station.normalizedStationName,
      stationType: station.category,
      timeDay: station.observedAt,
      heightM: latestValue,
      previousHeightM: previousValue,
      heightDeltaM: latestValue !== null && previousValue !== null ? Number(delta.toFixed(3)) : null,
      gaugeDatum: station.unit === "m" ? "mAHD" : station.unit,
      tendency,
      statusLabel: normaliseStatusLabel(tendency),
      floodClassification: null,
      points,
    };
  });

  const latestObservedAt = stations
    .map((station) => station.timeDay)
    .filter(Boolean)
    .sort()
    .at(-1);
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
    sourceLabel: raw?.provider ?? "City of Parramatta FloodSmart river gauges",
    issuedDate: latestObservedAt ?? null,
    region: "Parramatta River",
    headlineTrend: primaryStation
      ? `${primaryStation.statusLabel} at ${primaryStation.stationName}`
      : "No river data available",
    stationCount: stations.length,
    tendencyCounts,
    primaryStation,
    stations,
  };
}
