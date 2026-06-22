import { areaConfigs, defaultAreaId, getAreaConfig, listAreas } from "./areaConfig.js";
import { historyDir, latestSignalsPath, sourceConfig } from "./config.js";
import { loadSource } from "./fetchers.js";
import {
  normalizeRainfall,
  normalizeRiverContext,
  normalizeWeather,
  normalizeWeatherRainfall,
} from "./normalisers.js";
import { assessRisk } from "./riskEngine.js";
import { buildFeatureRows, buildFeatureSummary } from "./features.js";
import { buildBaselinePrediction } from "./baselineModel.js";
import { readCommunityReports, summariseCommunityReports } from "./communityReports.js";
import { appendRegionalHistory, readAreaHistory, readLatestSignals, writeLatestSignals } from "./store.js";

function matchesRelevantStation(value, relevantNames = []) {
  return relevantNames.some((name) => value?.toLowerCase() === name.toLowerCase());
}

function filterRainfallForArea(rainfallSeries, area) {
  const relevantStationNumbers = area.relevantStations.rainfall ?? [];
  const isDerivedWeatherRainfall = rainfallSeries.aggregation === "Observation rain trace";

  if (
    isDerivedWeatherRainfall ||
    relevantStationNumbers.length === 0 ||
    relevantStationNumbers.includes(rainfallSeries.stationNumber)
  ) {
    return {
      ...rainfallSeries,
      areaRelevance: {
        areaId: area.id,
        matched: true,
        reason: isDerivedWeatherRainfall
          ? "Live BoM rain-trace observations are used while the mapped rainfall gauge API is not configured."
          : "Rainfall station is mapped to this area.",
      },
    };
  }

  return {
    ...rainfallSeries,
    latestValidRainfallMm: null,
    points: [],
    areaRelevance: {
      areaId: area.id,
      matched: false,
      reason: "No rainfall station mapping matched this area.",
    },
  };
}

function filterRiverForArea(riverContext, area) {
  const relevantRiverStations = area.relevantStations.river ?? [];
  const stations = (riverContext.stations ?? []).filter((station) =>
    matchesRelevantStation(station.stationName, relevantRiverStations),
  );
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
  const primaryStation =
    stations.find((station) => station.stationName?.includes("Parramatta River at Riverside Theatre")) ||
    stations[0] ||
    null;

  return {
    ...riverContext,
    headlineTrend: primaryStation
      ? `${primaryStation.statusLabel} at ${primaryStation.stationName}`
      : "No relevant river data available",
    stationCount: stations.length,
    tendencyCounts,
    primaryStation,
    stations,
    areaRelevance: {
      areaId: area.id,
      matchedStations: stations.map((station) => station.stationName),
      missingStations: relevantRiverStations.filter(
        (stationName) => !stations.some((station) => station.stationName === stationName),
      ),
    },
  };
}

function buildAreaSourceMetadata(area, sourceMetadata) {
  return sourceMetadata.map((metadata) => ({
    ...metadata,
    areaId: area.id,
    areaName: area.name,
    areaRelevance:
      metadata.type === "river"
        ? area.relevantStations.river
        : metadata.type === "rainfall"
          ? area.relevantStations.rainfall
          : area.relevantStations.weather,
  }));
}

function parseSourceTimestamp(value) {
  if (!value) return null;

  if (/^\d{14}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(
      8,
      10,
    )}:${value.slice(10, 12)}:${value.slice(12, 14)}+10:00`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return `${value}T00:00:00+10:00`;
  }

  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

function hoursBetween(start, end) {
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();

  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return null;

  return Math.max(0, Math.round(((endMs - startMs) / (60 * 60 * 1000)) * 10) / 10);
}

function sourceObservedAt(metadata, signals) {
  if (metadata.type === "weather") {
    return parseSourceTimestamp(signals.weatherObservations?.observedAt);
  }

  if (metadata.type === "rainfall") {
    return parseSourceTimestamp(signals.rainfallSeries?.points?.at(-1)?.time);
  }

  if (metadata.type === "river") {
    return parseSourceTimestamp(signals.riverContext?.issuedDate);
  }

  return null;
}

function staleAfterHours(type) {
  if (type === "weather") return 12;
  if (type === "rainfall") return 48;
  if (type === "river") return 24;
  return 24;
}

function buildAreaSourceFreshness(area, sourceMetadata, signals, ingestedAt) {
  return buildAreaSourceMetadata(area, sourceMetadata).map((metadata) => {
    const observedAt = sourceObservedAt(metadata, signals);
    const ageHours = observedAt ? hoursBetween(observedAt, ingestedAt) : null;
    const staleLimitHours = staleAfterHours(metadata.type);
    const isStale = ageHours !== null && ageHours > staleLimitHours;

    return {
      ...metadata,
      observedAt,
      ageHours,
      staleAfterHours: staleLimitHours,
      freshnessStatus: observedAt === null ? "unknown" : isStale ? "stale" : "current",
    };
  });
}

function buildFreshnessSummary(sourceMetadata) {
  const failedSources = sourceMetadata.filter((metadata) => metadata.status === "failed");
  const fallbackSources = sourceMetadata.filter((metadata) => metadata.mode === "local-fallback");
  const staleSources = sourceMetadata.filter((metadata) => metadata.freshnessStatus === "stale");
  const fetchedTimes = sourceMetadata
    .map((metadata) => metadata.fetchedAt)
    .filter(Boolean)
    .sort();

  return {
    latestFetchedAt: fetchedTimes.at(-1) ?? null,
    sourceCount: sourceMetadata.length,
    failedSourceCount: failedSources.length,
    fallbackSourceCount: fallbackSources.length,
    staleSourceCount: staleSources.length,
    status:
      failedSources.length > 0
        ? "partial"
        : staleSources.length > 0
          ? "stale"
          : fallbackSources.length > 0
            ? "mixed"
            : "ok",
    notes:
      failedSources.length > 0
        ? failedSources.map((metadata) => `${metadata.label}: ${metadata.note}`)
        : staleSources.length > 0
          ? staleSources.map(
              (metadata) =>
                `${metadata.label} source data is ${metadata.ageHours}h old; expected within ${metadata.staleAfterHours}h.`,
            )
        : fallbackSources.length > 0
          ? fallbackSources.map((metadata) => `${metadata.label} is using local fallback data.`)
        : ["All configured signal sources were available."],
  };
}

function buildDataQuality(signals) {
  const missing = [];
  if (!signals.weatherObservations?.stationName) missing.push("weather");
  if ((signals.rainfallSeries?.points ?? []).length === 0) missing.push("rainfall");
  if ((signals.riverContext?.stations ?? []).length === 0) missing.push("river");
  const fallbackSources = (signals.sourceMetadata ?? []).filter(
    (metadata) => metadata.mode === "local-fallback",
  );
  const staleSources = (signals.sourceMetadata ?? []).filter(
    (metadata) => metadata.freshnessStatus === "stale",
  );

  return {
    status:
      missing.length > 0
        ? "partial"
        : staleSources.length > 0
          ? "stale-source"
        : fallbackSources.length > 0
          ? "mixed-source"
          : "live",
    missing,
    fallbackSources: fallbackSources.map((metadata) => metadata.label),
    staleSources: staleSources.map((metadata) => metadata.label),
    coverageScore: Math.round(((3 - missing.length) / 3) * 100),
  };
}

function buildSourceFit({ expected = 0, matched = 0, label }) {
  return {
    label,
    expected,
    matched,
    missing: Math.max(expected - matched, 0),
    score: expected > 0 ? Math.round((matched / expected) * 100) : 100,
  };
}

function buildAreaRelevance(area, weatherObservations, rainfallSeries, riverContext) {
  const configuredWeatherCount = area.relevantStations.weather?.length ?? 0;
  const configuredRainfallCount = area.relevantStations.rainfall?.length ?? 0;
  const configuredRiverCount = area.relevantStations.river?.length ?? 0;
  const weatherMatched = weatherObservations.areaRelevance?.matched ? 1 : 0;
  const rainfallMatched = rainfallSeries.areaRelevance?.matched ? 1 : 0;
  const matchedRiverCount = riverContext.areaRelevance?.matchedStations?.length ?? 0;
  const sourceFit = {
    weather: buildSourceFit({
      expected: configuredWeatherCount,
      matched: weatherMatched,
      label: "Weather observation station",
    }),
    rainfall: buildSourceFit({
      expected: configuredRainfallCount,
      matched: rainfallMatched,
      label: "Rainfall gauge or proxy",
    }),
    river: buildSourceFit({
      expected: configuredRiverCount,
      matched: matchedRiverCount,
      label: "River and creek stations",
    }),
  };
  const expectedSignals =
    sourceFit.weather.expected + sourceFit.rainfall.expected + sourceFit.river.expected;
  const matchedSignals =
    sourceFit.weather.matched + sourceFit.rainfall.matched + sourceFit.river.matched;
  const score = expectedSignals > 0 ? Math.round((matchedSignals / expectedSignals) * 100) : 100;
  const missingRiverStations = riverContext.areaRelevance?.missingStations ?? [];
  const status = score >= 90 ? "complete" : score >= 60 ? "partial" : "limited";

  return {
    areaId: area.id,
    areaName: area.name,
    catchment: area.catchment,
    status,
    score,
    matchedSignals,
    expectedSignals,
    sourceFit,
    matchedRiverStations: riverContext.areaRelevance?.matchedStations ?? [],
    missingRiverStations,
    notes: [
      `${matchedSignals}/${expectedSignals} configured station signals currently map to ${area.name}.`,
      missingRiverStations.length > 0
        ? `${missingRiverStations.length} configured river/creek station(s) are not present in the current feed.`
        : "All configured river/creek stations for this area are present in the current feed.",
    ],
  };
}

function buildAreaSignals(area, normalizedSources, sourceMetadata, ingestedAt, publicSignalSummary) {
  const rainfallSeries = filterRainfallForArea(normalizedSources.rainfallSeries, area);
  const riverContext = filterRiverForArea(normalizedSources.riverContext, area);
  const weatherObservations = {
    ...normalizedSources.weatherObservations,
    areaRelevance: {
      areaId: area.id,
      matched: matchesRelevantStation(
        normalizedSources.weatherObservations.stationName,
        area.relevantStations.weather,
      ),
      reason: "Weather station is used as the nearest configured public observation feed.",
    },
  };
  const areaRelevance = buildAreaRelevance(area, weatherObservations, rainfallSeries, riverContext);

  const baseSignals = {
    area: {
      id: area.id,
      name: area.name,
      region: area.region,
      catchment: area.catchment,
    },
    location: {
      name: area.name,
      region: area.region,
      lat: area.lat ?? weatherObservations.lat,
      lon: area.lon ?? weatherObservations.lon,
    },
    relevantStations: area.relevantStations,
    weatherObservations,
    rainfallSeries,
    riverContext,
    publicSignalSummary,
    areaRelevance,
    sourceMetadata: buildAreaSourceFreshness(
      area,
      sourceMetadata,
      { weatherObservations, rainfallSeries, riverContext },
      ingestedAt,
    ),
    ingestedAt,
  };
  const freshness = buildFreshnessSummary(baseSignals.sourceMetadata);
  const dataQuality = buildDataQuality(baseSignals);
  const signals = {
    ...baseSignals,
    freshness,
    dataQuality,
  };

  return {
    ...signals,
    riskAssessment: assessRisk(signals),
  };
}

export async function buildRegionalSignals() {
  const ingestedAt = new Date().toISOString();
  const [weatherSource, rainfallSource, riverSource] = await Promise.all([
    loadSource(sourceConfig.weather),
    loadSource(sourceConfig.rainfall),
    loadSource(sourceConfig.river),
  ]);
  let rainfallSeries = normalizeRainfall(rainfallSource.data);
  let rainfallMetadata = {
    label: "North Parramatta rainfall gauge",
    type: "rainfall",
    note: "Nearby rainfall time series normalised from the ingestion pipeline.",
    ...rainfallSource.metadata,
  };

  if (rainfallSource.metadata.mode !== "remote" && weatherSource.metadata.mode === "remote") {
    rainfallSeries = normalizeWeatherRainfall(weatherSource.data);
    rainfallMetadata = {
      label: "BoM Parramatta rain trace observations",
      type: "rainfall",
      note: "Live BoM rain-trace observations are used for the graph until a WaterNSW rainfall URL is configured.",
      ...weatherSource.metadata,
      mode: "remote-derived",
      derivedFrom: weatherSource.metadata.source,
    };
  }

  const sourceMetadata = [
    {
      label: "Parramatta weather observations",
      type: "weather",
      note: "Current local weather observations normalised from the ingestion pipeline.",
      ...weatherSource.metadata,
    },
    rainfallMetadata,
    {
      label: "Parramatta river context",
      type: "river",
      note: "Current local river and creek heights normalised from the ingestion pipeline.",
      ...riverSource.metadata,
    },
  ];
  const normalizedSources = {
    weatherObservations: normalizeWeather(weatherSource.data),
    rainfallSeries,
    riverContext: normalizeRiverContext(riverSource.data),
  };
  const areaEntries = await Promise.all(
    Object.values(areaConfigs).map(async (area) => {
      const communityReports = await readCommunityReports(area.id, 50);
      const publicSignalSummary = summariseCommunityReports(communityReports, ingestedAt);

      return [
        area.id,
        buildAreaSignals(area, normalizedSources, sourceMetadata, ingestedAt, publicSignalSummary),
      ];
    }),
  );
  const areas = Object.fromEntries(areaEntries);

  return {
    defaultAreaId,
    areas,
    areaList: listAreas(),
    sourceMetadata,
    ingestedAt,
  };
}

export async function runRegionalIngestion() {
  const signals = await buildRegionalSignals();
  await writeLatestSignals(latestSignalsPath, signals);
  await appendRegionalHistory(historyDir, signals);
  return signals;
}

export async function readOrRefreshRegionalSignals() {
  try {
    return await readLatestSignals(latestSignalsPath);
  } catch {
    return runRegionalIngestion();
  }
}

export function selectAreaSignals(regionalSignals, areaId = defaultAreaId) {
  const resolvedAreaId = areaId || regionalSignals.defaultAreaId || defaultAreaId;
  return regionalSignals.areas?.[resolvedAreaId] ?? null;
}

export function areaExists(areaId) {
  return Boolean(getAreaConfig(areaId));
}

export async function readHistoricalSignals(areaId = defaultAreaId, limit = 24) {
  return readAreaHistory(historyDir, areaId, limit);
}

export async function readAreaFeatureDataset(areaId = defaultAreaId, limit = 100) {
  const history = await readAreaHistory(historyDir, areaId, limit);
  const rows = buildFeatureRows(history);

  return {
    areaId,
    summary: buildFeatureSummary(rows),
    rows,
  };
}

export async function readAreaBaselinePrediction(areaId = defaultAreaId, limit = 100) {
  const history = await readAreaHistory(historyDir, areaId, limit);
  const rows = buildFeatureRows(history);

  return {
    areaId,
    ...buildBaselinePrediction(rows),
  };
}
