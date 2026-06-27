import { areaConfigs, defaultAreaId, getAreaConfig, listAreas } from "./areaConfig.js";
import {
  historyDir,
  ingestionPolicy,
  latestSignalsPath,
  latestSignalsSchemaVersion,
  sourceConfig,
} from "./config.js";
import { loadSource } from "./fetchers.js";
import {
  normalizeFloodSmartRainfall,
  normalizeFloodSmartRiverContext,
  normalizeOfficialWarnings,
  normalizeRainfall,
  normalizeRiverContext,
  normalizeWeather,
  normalizeWeatherRainfall,
} from "./normalisers.js";
import { assessRisk } from "./riskEngine.js";
import { buildDatasetQualityReport, buildFeatureRows, buildFeatureSummary } from "./features.js";
import { buildBaselineModelCard, buildBaselinePrediction } from "./baselineModel.js";
import { buildModelExperiment } from "./modelExperiment.js";
import { buildRegionalIngestionHealth } from "./health.js";
import { readCommunityReports, summariseCommunityReports } from "./communityReports.js";
import { appendRegionalHistory, readAreaHistory, readLatestSignals, writeLatestSignals } from "./store.js";
import { buildSpatialRelevance, resolveSpatialQuery } from "./spatialRelevance.js";

function matchesRelevantStation(value, relevantNames = []) {
  return relevantNames.some((name) => value?.toLowerCase() === name.toLowerCase());
}

function filterRainfallForArea(rainfallSeries, area) {
  const relevantStationNumbers = area.relevantStations.rainfall ?? [];
  const isDerivedWeatherRainfall = rainfallSeries.aggregation === "Observation rain trace";
  const matchedGaugeStation = (rainfallSeries.stations ?? []).find((station) =>
    relevantStationNumbers.includes(station.stationNumber),
  );

  if (matchedGaugeStation) {
    return {
      ...rainfallSeries,
      ...matchedGaugeStation,
      stations: rainfallSeries.stations,
      areaRelevance: {
        areaId: area.id,
        matched: true,
        reason: "Rainfall station is mapped to this area.",
      },
    };
  }

  if (isDerivedWeatherRainfall || relevantStationNumbers.length === 0) {
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

  if (relevantStationNumbers.includes(rainfallSeries.stationNumber)) {
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
          : metadata.type === "warnings"
            ? [area.name, area.catchment]
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

  if (metadata.type === "warnings") {
    return parseSourceTimestamp(signals.warningSummary?.observedAt);
  }

  return null;
}

function staleAfterHours(type) {
  return ingestionPolicy.maxAgeHours[type] ?? 24;
}

function buildAreaSourceFreshness(area, sourceMetadata, signals, ingestedAt) {
  return buildAreaSourceMetadata(area, sourceMetadata).map((metadata) => {
    if (metadata.status === "not-connected") {
      return {
        ...metadata,
        observedAt: null,
        ageHours: null,
        staleAfterHours: staleAfterHours(metadata.type),
        freshnessStatus: "not-connected",
      };
    }

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
  const spatialRelevance = buildSpatialRelevance(area);
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
    spatial: {
      method: spatialRelevance.method,
      status: spatialRelevance.status,
      nearestStationDistanceKm: spatialRelevance.nearestStationDistanceKm,
      coverageRadiusKm: spatialRelevance.coverageRadiusKm,
      stationCount: spatialRelevance.stationCount,
    },
    notes: [
      `${matchedSignals}/${expectedSignals} configured station signals currently map to ${area.name}.`,
      spatialRelevance.coverageRadiusKm === null
        ? "Spatial station coverage is waiting for coordinate metadata."
        : `Configured stations sit within ${spatialRelevance.coverageRadiusKm} km of the area centroid.`,
      missingRiverStations.length > 0
        ? `${missingRiverStations.length} configured river/creek station(s) are not present in the current feed.`
        : "All configured river/creek stations for this area are present in the current feed.",
    ],
  };
}

function buildAreaSignals(area, normalizedSources, sourceMetadata, ingestedAt, publicSignalSummary) {
  const rainfallSeries = filterRainfallForArea(normalizedSources.rainfallSeries, area);
  const riverContext = filterRiverForArea(normalizedSources.riverContext, area);
  const warningSummary = normalizeOfficialWarnings(normalizedSources.warningStatus, area);
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
  const spatialRelevance = buildSpatialRelevance(area);

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
    warningSummary,
    publicSignalSummary,
    areaRelevance,
    spatialRelevance,
    sourceMetadata: buildAreaSourceFreshness(
      area,
      sourceMetadata,
      { weatherObservations, rainfallSeries, riverContext, warningSummary },
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

function normalizeConfiguredRainfall(source) {
  if (source.metadata.adapter === "floodsmart-rainfall") {
    return normalizeFloodSmartRainfall(source.data);
  }

  return normalizeRainfall(source.data);
}

function normalizeConfiguredRiver(source) {
  if (source.metadata.adapter === "floodsmart-river") {
    return normalizeFloodSmartRiverContext(source.data);
  }

  return normalizeRiverContext(source.data);
}

function disconnectedWarningMetadata(area, fetchedAt) {
  return {
    label: sourceConfig.warnings.label,
    type: "warnings",
    note: "Official warning integration is configured as an optional source and is not connected yet.",
    mode: "not-configured",
    source: null,
    sourceStrength: "official_warning",
    fetchedAt,
    status: "not-connected",
    areaId: area.id,
    areaName: area.name,
    areaRelevance: [area.name, area.catchment],
    observedAt: null,
    ageHours: null,
    staleAfterHours: staleAfterHours("warnings"),
    freshnessStatus: "not-connected",
  };
}

function migrateAreaSignals(areaSignals, regionalIngestedAt) {
  const area = getAreaConfig(areaSignals.area?.id) ?? areaSignals.area;
  const hasWarningSource = (areaSignals.sourceMetadata ?? []).some(
    (source) => source.type === "warnings",
  );
  const sourceMetadata = hasWarningSource
    ? (areaSignals.sourceMetadata ?? [])
    : [
        ...(areaSignals.sourceMetadata ?? []),
        disconnectedWarningMetadata(area, regionalIngestedAt ?? areaSignals.ingestedAt),
      ];
  const warningSummary = areaSignals.warningSummary ?? normalizeOfficialWarnings(null, area);
  const freshness = buildFreshnessSummary(sourceMetadata);
  const migratedSignals = {
    ...areaSignals,
    warningSummary,
    sourceMetadata,
    freshness,
    dataQuality: buildDataQuality({
      ...areaSignals,
      warningSummary,
      sourceMetadata,
      freshness,
    }),
  };

  return {
    ...migratedSignals,
    riskAssessment: assessRisk(migratedSignals),
  };
}

function migrateRegionalSignals(regionalSignals) {
  if (!regionalSignals || regionalSignals.schemaVersion === latestSignalsSchemaVersion) {
    return regionalSignals;
  }

  if (![2, 3].includes(regionalSignals.schemaVersion)) return regionalSignals;

  const areas = Object.fromEntries(
    Object.entries(regionalSignals.areas ?? {}).map(([areaId, areaSignals]) => [
      areaId,
      migrateAreaSignals(areaSignals, regionalSignals.ingestedAt),
    ]),
  );
  const sourceMetadata = (regionalSignals.sourceMetadata ?? []).some(
    (source) => source.type === "warnings",
  )
    ? regionalSignals.sourceMetadata
    : [
        ...(regionalSignals.sourceMetadata ?? []),
        {
          label: sourceConfig.warnings.label,
          type: "warnings",
          note: "Official warning integration is configured as an optional source and is not connected yet.",
          mode: "not-configured",
          source: null,
          sourceStrength: "official_warning",
          fetchedAt: regionalSignals.ingestedAt,
          status: "not-connected",
        },
      ];
  const migratedRegionalSignals = {
    ...regionalSignals,
    schemaVersion: latestSignalsSchemaVersion,
    areas,
    sourceMetadata,
  };

  return {
    ...migratedRegionalSignals,
    ingestionHealth: buildRegionalIngestionHealth(migratedRegionalSignals),
  };
}

function hasCurrentSignalSchema(regionalSignals) {
  if (regionalSignals?.schemaVersion !== latestSignalsSchemaVersion) return false;

  return Object.values(regionalSignals.areas ?? {}).every((areaSignals) =>
    (areaSignals.sourceMetadata ?? []).every((source) => source.sourceStrength) &&
      (areaSignals.sourceMetadata ?? []).some((source) => source.type === "warnings") &&
      typeof areaSignals.riskAssessment?.features?.rainfall1hMm === "number" &&
      typeof areaSignals.riskAssessment?.features?.dataFreshnessScore === "number",
  );
}

function hasBlockedCoreFloodHealth(regionalSignals) {
  const health = regionalSignals.ingestionHealth ?? buildRegionalIngestionHealth(regionalSignals);
  return health.coreFloodStatus === "blocked";
}

function annotateRegionalSignals(regionalSignals, refreshMetadata) {
  const areas = Object.fromEntries(
    Object.entries(regionalSignals.areas ?? {}).map(([areaId, areaSignals]) => [
      areaId,
      {
        ...areaSignals,
        refreshMetadata,
      },
    ]),
  );

  return {
    ...regionalSignals,
    areas,
    refreshMetadata,
  };
}

export async function buildRegionalSignals() {
  const ingestedAt = new Date().toISOString();
  const [weatherSource, rainfallSource, riverSource, warningSource] = await Promise.all([
    loadSource(sourceConfig.weather),
    loadSource(sourceConfig.rainfall),
    loadSource(sourceConfig.river),
    loadSource(sourceConfig.warnings),
  ]);
  let rainfallSeries = normalizeConfiguredRainfall(rainfallSource);
  let rainfallMetadata = {
    ...rainfallSource.metadata,
    label: rainfallSource.metadata.label,
    type: "rainfall",
    note: "Nearby rainfall time series normalised from the ingestion pipeline.",
  };

  if (rainfallSource.metadata.mode !== "remote" && weatherSource.metadata.mode === "remote") {
    rainfallSeries = normalizeWeatherRainfall(weatherSource.data);
    rainfallMetadata = {
      ...weatherSource.metadata,
      label: "BoM Parramatta rain trace observations",
      type: "rainfall",
      note: "Live BoM rain-trace observations are used for the graph until a primary rainfall gauge is available.",
      mode: "remote-derived",
      sourceStrength: "weather_proxy",
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
      label: riverSource.metadata.label,
      type: "river",
      note: "Current local river and creek heights normalised from the ingestion pipeline.",
      ...riverSource.metadata,
    },
    {
      label: warningSource.metadata.label,
      type: "warnings",
      note:
        warningSource.metadata.status === "not-connected"
          ? "Official warning integration is configured as an optional source and is not connected yet."
          : "Official warning status normalised from the configured NSW SES/HazardWatch source.",
      ...warningSource.metadata,
    },
  ];
  const normalizedSources = {
    weatherObservations: normalizeWeather(weatherSource.data),
    rainfallSeries,
    riverContext: normalizeConfiguredRiver(riverSource),
    warningStatus: warningSource.data,
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

  const regionalSignals = {
    schemaVersion: latestSignalsSchemaVersion,
    defaultAreaId,
    areas,
    areaList: listAreas(),
    sourceMetadata,
    ingestedAt,
  };

  return {
    ...regionalSignals,
    ingestionHealth: buildRegionalIngestionHealth(regionalSignals),
  };
}

export async function runRegionalIngestion({ protectCache = false } = {}) {
  const signals = await buildRegionalSignals();
  let existingSignals = null;

  try {
    existingSignals = migrateRegionalSignals(await readLatestSignals(latestSignalsPath));
  } catch {
    existingSignals = null;
  }

  const blockedCoreSignals = hasBlockedCoreFloodHealth(signals);
  const canReuseExisting =
    protectCache &&
    existingSignals &&
    hasCurrentSignalSchema(existingSignals) &&
    !hasBlockedCoreFloodHealth(existingSignals);

  if (blockedCoreSignals && canReuseExisting) {
    return annotateRegionalSignals(existingSignals, {
      status: "protected-cache",
      attemptedAt: signals.ingestedAt,
      servedAt: new Date().toISOString(),
      reason: "Live refresh was blocked, so the latest good core-gauge snapshot was kept.",
    });
  }

  if (!blockedCoreSignals || !existingSignals) {
    await writeLatestSignals(latestSignalsPath, signals);
    await appendRegionalHistory(historyDir, signals);
  }

  return annotateRegionalSignals(signals, {
    status: blockedCoreSignals ? "blocked-refresh" : "refreshed",
    attemptedAt: signals.ingestedAt,
    servedAt: new Date().toISOString(),
  });
}

export async function readOrRefreshRegionalSignals() {
  try {
    const signals = migrateRegionalSignals(await readLatestSignals(latestSignalsPath));
    return hasCurrentSignalSchema(signals)
      ? annotateRegionalSignals(signals, {
          status: "cache",
          servedAt: new Date().toISOString(),
        })
      : await runRegionalIngestion({ protectCache: true });
  } catch {
    return runRegionalIngestion({ protectCache: true });
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
    quality: buildDatasetQualityReport(rows),
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

export async function readAreaDatasetQuality(areaId = defaultAreaId, limit = 100) {
  const history = await readAreaHistory(historyDir, areaId, limit);
  const rows = buildFeatureRows(history);

  return {
    areaId,
    ...buildDatasetQualityReport(rows),
  };
}

export async function readAreaModelCard(areaId = defaultAreaId, limit = 100) {
  const history = await readAreaHistory(historyDir, areaId, limit);
  const rows = buildFeatureRows(history);
  const datasetQuality = buildDatasetQualityReport(rows);

  return {
    areaId,
    ...buildBaselineModelCard(rows, datasetQuality),
  };
}

export async function readAreaModelExperiment(areaId = defaultAreaId, limit = 100) {
  const history = await readAreaHistory(historyDir, areaId, limit);
  const rows = buildFeatureRows(history);

  return {
    areaId,
    ...buildModelExperiment(rows),
  };
}

export function readSpatialRelevance({ areaId = null, lat = null, lon = null } = {}) {
  return resolveSpatialQuery({ areaId, lat, lon });
}
