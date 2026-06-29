import { dataSourceConfig, ingestionPolicy, sourceConfig } from "./config.js";

const passStrengthByType = {
  rainfall: ["primary_live_gauge", "official_backup"],
  river: ["primary_live_gauge", "official_backup"],
  weather: ["official_backup"],
  warnings: ["official_warning"],
};

function resolveSourceUrl(source) {
  return process.env[source.envUrl] || process.env[source.roadmapEnvUrl] || source.defaultUrl || null;
}

function registryEntry([id, source]) {
  const configuredUrl = process.env[source.envUrl] || process.env[source.roadmapEnvUrl] || null;

  return {
    id,
    label: source.label,
    role: source.role,
    priority: source.priority,
    sourceStrength: source.sourceStrength,
    envUrl: source.envUrl,
    configured: Boolean(configuredUrl),
    url: configuredUrl || source.apiUrl || source.url || source.rainGeojsonUrl || null,
    pageUrl: source.pageUrl || source.secondaryUrl || null,
    machineReadable: source.machineReadable,
  };
}

function signalType(sourceType) {
  return sourceType === "warnings" ? "warning" : sourceType;
}

function sourceDataMode(source) {
  if (source.dataMode) return source.dataMode;
  if (source.mode === "remote") return "live";
  if (source.mode === "remote-derived") return "derived_proxy";
  if (source.mode === "local-fallback") return "local_demo_fallback";
  if (source.mode === "not-configured" || source.mode === "unavailable") return "missing";
  return source.mode ?? "unknown";
}

function qualityNotes(source) {
  const notes = [];

  if (source.note) notes.push(source.note);
  if (source.freshnessStatus === "stale") {
    notes.push(`Observation is stale at ${source.ageMinutes ?? "unknown"} minute(s) old.`);
  }
  if (source.freshnessStatus === "missing") {
    notes.push("No current observation timestamp is available.");
  }
  if (source.sourceStrength === "weather_proxy") {
    notes.push("This source is displayed as context and excluded from live core flood scoring.");
  }
  if (sourceDataMode(source) === "local_demo_fallback") {
    notes.push("This source is demo fallback data and cannot support a live core flood claim.");
  }
  if (Array.isArray(source.areaRelevance) && source.areaRelevance.length > 0) {
    notes.push(`Expected local mapping: ${source.areaRelevance.join(", ")}.`);
  }

  return notes;
}

function buildAreaEvidence(areaSignals) {
  return {
    area: areaSignals.area.id,
    areaName: areaSignals.area.name,
    overallStatus: areaSignals.ingestionHealth?.overallStatus ?? null,
    sources: (areaSignals.sourceMetadata ?? []).map((source, index) => ({
      sourceId: `${areaSignals.area.id}-${source.type}-${index}`,
      sourceName: source.label,
      sourceUrl: source.source ?? null,
      sourceStrength: source.sourceStrength ?? "unknown",
      signalType: signalType(source.type),
      area: areaSignals.area.id,
      stationId:
        source.type === "rainfall" && Array.isArray(source.areaRelevance) && source.areaRelevance.length === 1
          ? String(source.areaRelevance[0])
          : null,
      stationName:
        source.type === "river" && Array.isArray(source.areaRelevance) && source.areaRelevance.length === 1
          ? source.areaRelevance[0]
          : null,
      observedAt: source.observedAt ?? null,
      fetchedAt: source.fetchedAt,
      ageMinutes: source.ageMinutes ?? null,
      freshnessStatus: source.freshnessStatus ?? "unknown",
      dataMode: sourceDataMode(source),
      qualityNotes: qualityNotes(source),
      stationMapping: Array.isArray(source.areaRelevance) ? source.areaRelevance : [],
    })),
  };
}

export function getSourceRegistry(regionalSignals = null) {
  const generatedAt = new Date().toISOString();
  const baseRegistry = {
    generatedAt,
    policy: {
      allowLocalFallback: ingestionPolicy.allowLocalFallback,
      maxAgeHours: ingestionPolicy.maxAgeHours,
      passStrengthByType,
      blockWhen: [
        "river gauge data is fallback, stale, unavailable, or not a live/official gauge source",
        "rainfall gauge data is fallback, stale, unavailable, or only historical context",
        "core rainfall or river station mapping is wrong",
      ],
      warnWhen: [
        "rainfall is derived from BoM weather rain trace rather than a mapped gauge",
        "BoM weather context is stale while gauges are otherwise fresh",
        "official warning feed is not connected yet",
        "supporting metadata or context coverage is partial",
      ],
    },
    activeIngestion: {
      weather: {
        label: sourceConfig.weather.label,
        envUrl: sourceConfig.weather.envUrl,
        roadmapEnvUrl: sourceConfig.weather.roadmapEnvUrl,
        sourceStrength: sourceConfig.weather.sourceStrength,
        url: resolveSourceUrl(sourceConfig.weather),
      },
      rainfall: {
        label: sourceConfig.rainfall.label,
        envUrl: sourceConfig.rainfall.envUrl,
        roadmapEnvUrl: sourceConfig.rainfall.roadmapEnvUrl,
        sourceStrength: sourceConfig.rainfall.sourceStrength,
        adapter: sourceConfig.rainfall.adapter,
        stationCodes: sourceConfig.rainfall.stationCodes,
        url: resolveSourceUrl(sourceConfig.rainfall),
      },
      river: {
        label: sourceConfig.river.label,
        envUrl: sourceConfig.river.envUrl,
        roadmapEnvUrl: sourceConfig.river.roadmapEnvUrl,
        sourceStrength: sourceConfig.river.sourceStrength,
        adapter: sourceConfig.river.adapter,
        stationCodes: sourceConfig.river.stationCodes,
        url: resolveSourceUrl(sourceConfig.river),
      },
      warnings: {
        label: sourceConfig.warnings.label,
        envUrl: sourceConfig.warnings.envUrl,
        sourceStrength: sourceConfig.warnings.sourceStrength,
        optional: sourceConfig.warnings.optional,
        url: resolveSourceUrl(sourceConfig.warnings),
      },
    },
    roadmapSources: Object.entries(dataSourceConfig)
      .map(registryEntry)
      .sort((a, b) => a.priority - b.priority),
  };

  if (!regionalSignals) return baseRegistry;

  return {
    ...baseRegistry,
    areas: Object.values(regionalSignals.areas ?? {}).map((areaSignals) => buildAreaEvidence(areaSignals)),
  };
}
