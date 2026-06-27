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

export function getSourceRegistry() {
  return {
    generatedAt: new Date().toISOString(),
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
}
