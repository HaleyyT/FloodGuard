import { areaConfigs, defaultAreaId, getAreaConfig, listAreas } from "./areaConfig.js";
import { latestSignalsPath, sourceConfig } from "./config.js";
import { loadSource } from "./fetchers.js";
import { normalizeRainfall, normalizeRiverContext, normalizeWeather } from "./normalisers.js";
import { assessRisk } from "./riskEngine.js";
import { readLatestSignals, writeLatestSignals } from "./store.js";

function matchesRelevantStation(value, relevantNames = []) {
  return relevantNames.some((name) => value?.toLowerCase() === name.toLowerCase());
}

function filterRainfallForArea(rainfallSeries, area) {
  const relevantStationNumbers = area.relevantStations.rainfall ?? [];

  if (
    relevantStationNumbers.length === 0 ||
    relevantStationNumbers.includes(rainfallSeries.stationNumber)
  ) {
    return {
      ...rainfallSeries,
      areaRelevance: {
        areaId: area.id,
        matched: true,
        reason: "Rainfall station is mapped to this area.",
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

function buildFreshnessSummary(sourceMetadata) {
  const failedSources = sourceMetadata.filter((metadata) => metadata.status === "failed");
  const fetchedTimes = sourceMetadata
    .map((metadata) => metadata.fetchedAt)
    .filter(Boolean)
    .sort();

  return {
    latestFetchedAt: fetchedTimes.at(-1) ?? null,
    sourceCount: sourceMetadata.length,
    failedSourceCount: failedSources.length,
    status: failedSources.length > 0 ? "partial" : "ok",
    notes:
      failedSources.length > 0
        ? failedSources.map((metadata) => `${metadata.label}: ${metadata.note}`)
        : ["All configured signal sources were available."],
  };
}

function buildDataQuality(signals) {
  const missing = [];
  if (!signals.weatherObservations?.stationName) missing.push("weather");
  if ((signals.rainfallSeries?.points ?? []).length === 0) missing.push("rainfall");
  if ((signals.riverContext?.stations ?? []).length === 0) missing.push("river");

  return {
    status: missing.length === 0 ? "complete" : "partial",
    missing,
    coverageScore: Math.round(((3 - missing.length) / 3) * 100),
  };
}

function buildAreaSignals(area, normalizedSources, sourceMetadata, ingestedAt) {
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

  const signals = {
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
    sourceMetadata: buildAreaSourceMetadata(area, sourceMetadata),
    ingestedAt,
  };

  return {
    ...signals,
    freshness: buildFreshnessSummary(signals.sourceMetadata),
    dataQuality: buildDataQuality(signals),
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
  const sourceMetadata = [
    {
      label: "Parramatta weather observations",
      type: "weather",
      note: "Current local weather observations normalised from the ingestion pipeline.",
      ...weatherSource.metadata,
    },
    {
      label: "North Parramatta rainfall gauge",
      type: "rainfall",
      note: "Nearby rainfall time series normalised from the ingestion pipeline.",
      ...rainfallSource.metadata,
    },
    {
      label: "Parramatta river context",
      type: "river",
      note: "Current local river and creek heights normalised from the ingestion pipeline.",
      ...riverSource.metadata,
    },
  ];
  const normalizedSources = {
    weatherObservations: normalizeWeather(weatherSource.data),
    rainfallSeries: normalizeRainfall(rainfallSource.data),
    riverContext: normalizeRiverContext(riverSource.data),
  };
  const areas = Object.fromEntries(
    Object.values(areaConfigs).map((area) => [
      area.id,
      buildAreaSignals(area, normalizedSources, sourceMetadata, ingestedAt),
    ]),
  );

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
