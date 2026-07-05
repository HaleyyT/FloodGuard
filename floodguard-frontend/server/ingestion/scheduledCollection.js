import path from "node:path";

import { ingestionPolicy, sourceConfig, sourceEvidenceDir } from "./config.js";
import { loadSource } from "./fetchers.js";
import { appendJsonlRecord } from "./store.js";

const RAW_DIR = path.join(sourceEvidenceDir, "raw");
const PARSED_DIR = path.join(sourceEvidenceDir, "parsed");

const AREA_MATCHERS = [
  { areaId: "parramatta", terms: ["parramatta", "parramatta river"] },
  {
    areaId: "north-parramatta",
    terms: ["north parramatta", "darling mills", "darling mills creek"],
  },
  { areaId: "toongabbie", terms: ["toongabbie", "toongabbie creek"] },
];

function candidateUrl(definition) {
  if (definition.config) {
    return (
      process.env[definition.config.envUrl] ||
      process.env[definition.config.roadmapEnvUrl] ||
      definition.config.defaultUrl ||
      null
    );
  }

  return process.env[definition.envUrl] || definition.defaultUrl || null;
}

function buildDefaultDefinitions() {
  return [
    {
      key: "floodsmart_rainfall",
      label: "City of Parramatta FloodSmart rainfall gauges",
      config: sourceConfig.rainfall,
      rawFormat: "json",
      rawAccept: "application/json",
      evidenceType: "gauge_snapshot",
      sourceStrength: "primary_live_gauge",
    },
    {
      key: "floodsmart_river",
      label: "City of Parramatta FloodSmart river gauges",
      config: sourceConfig.river,
      rawFormat: "json",
      rawAccept: "application/json",
      evidenceType: "gauge_snapshot",
      sourceStrength: "primary_live_gauge",
    },
    {
      key: "bom_weather_context",
      label: "BoM Parramatta weather context",
      config: sourceConfig.weather,
      rawFormat: "json",
      rawAccept: "application/json",
      evidenceType: "weather_context",
      sourceStrength: "official_backup",
    },
    {
      key: "hazardwatch_warning_context",
      label: "NSW SES / HazardWatch warning context",
      config: sourceConfig.warnings,
      rawFormat: "html",
      rawAccept: "text/html,application/xhtml+xml",
      evidenceType: "warning_context",
      sourceStrength: "official_warning",
      optional: true,
    },
    {
      key: "bom_warning_rss",
      label: "BoM RSS warning/weather context",
      envUrl: "FLOODGUARD_BOM_WARNING_RSS_URL",
      rawFormat: "xml",
      rawAccept: "application/rss+xml,application/xml,text/xml",
      evidenceType: "warning_context",
      sourceStrength: "official_warning",
      optional: true,
      parsedLoader: parseBomRssSnapshot,
    },
    {
      key: "hazards_near_me_context",
      label: "Hazards Near Me warning context",
      envUrl: "FLOODGUARD_HAZARDS_NEAR_ME_URL",
      rawFormat: "json",
      rawAccept: "application/json,text/plain",
      evidenceType: "warning_context",
      sourceStrength: "official_warning",
      optional: true,
      parsedLoader: parseHazardsNearMeSnapshot,
    },
    {
      key: "transport_nsw_live_traffic",
      label: "Transport NSW Live Traffic hazards",
      envUrl: "FLOODGUARD_TRANSPORT_NSW_LIVE_TRAFFIC_URL",
      rawFormat: "json",
      rawAccept: "application/json,text/plain",
      evidenceType: "impact_context",
      sourceStrength: "impact_proxy",
      optional: true,
      parsedLoader: parseTransportSnapshot,
    },
    {
      key: "transport_nsw_historical_incidents",
      label: "Transport NSW historical incidents",
      envUrl: "FLOODGUARD_TRANSPORT_NSW_HISTORICAL_INCIDENTS_URL",
      rawFormat: "json",
      rawAccept: "application/json,text/plain",
      evidenceType: "impact_context",
      sourceStrength: "impact_proxy",
      optional: true,
      parsedLoader: parseTransportSnapshot,
    },
  ];
}

function fetchFailureCategory(error) {
  const message = String(error?.message ?? "").toLowerCase();
  if (error?.name === "TimeoutError" || error?.name === "AbortError" || message.includes("timeout")) {
    return "network_timeout";
  }
  if (message.includes("json") || message.includes("xml") || message.includes("parse")) {
    return "parser_error";
  }
  return "source_unavailable";
}

async function defaultRawFetcher(definition, url) {
  let lastError = null;

  for (let attempt = 0; attempt < ingestionPolicy.retryCount + 1; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { accept: definition.rawAccept },
        signal: AbortSignal.timeout(ingestionPolicy.fetchTimeoutMs),
      });
      if (!response.ok) {
        throw new Error(`Fetch failed with ${response.status} ${response.statusText}`);
      }
      const text = await response.text();
      return {
        fetchedAt: new Date().toISOString(),
        httpStatus: response.status,
        contentType: response.headers.get("content-type") ?? null,
        rawPayload:
          definition.rawFormat === "json"
            ? JSON.parse(text)
            : text,
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

function parseTimestamp(value) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

function matchedAreasFromText(value) {
  const text = String(value ?? "").toLowerCase();
  return AREA_MATCHERS.filter((matcher) => matcher.terms.some((term) => text.includes(term))).map(
    (matcher) => matcher.areaId,
  );
}

function xmlValue(block, tag) {
  const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
  return match ? match[1].trim() : "";
}

function parseBomRssSnapshot(definition, rawSnapshot, url) {
  const xml = String(rawSnapshot.rawPayload ?? "");
  const itemBlocks = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((match) => match[1]);
  const items = itemBlocks.map((block) => {
    const title = xmlValue(block, "title");
    const link = xmlValue(block, "link");
    const pubDate = xmlValue(block, "pubDate");
    const description = xmlValue(block, "description");
    return {
      title,
      link,
      observedAt: parseTimestamp(pubDate),
      description,
      matchedAreas: matchedAreasFromText(`${title} ${description}`),
    };
  });
  const matchedAreas = [...new Set(items.flatMap((item) => item.matchedAreas))];
  const observedAt = items.map((item) => item.observedAt).filter(Boolean).sort().at(-1) ?? null;

  return {
    sourceKey: definition.key,
    label: definition.label,
    sourceUrl: url,
    sourceStrength: definition.sourceStrength,
    evidenceType: definition.evidenceType,
    fetchedAt: rawSnapshot.fetchedAt,
    observedAt,
    status: items.length > 0 ? "ok" : "no_items",
    failureReason: items.length > 0 ? null : "rss_feed_empty",
    itemCount: items.length,
    warningCount: items.length,
    matchedAreas,
    items,
  };
}

function parseHazardsNearMeSnapshot(definition, rawSnapshot, url) {
  const payload =
    typeof rawSnapshot.rawPayload === "string"
      ? JSON.parse(rawSnapshot.rawPayload)
      : rawSnapshot.rawPayload;
  const alerts = Array.isArray(payload?.alerts)
    ? payload.alerts
    : Array.isArray(payload)
      ? payload
      : [];
  const items = alerts.map((alert) => {
    const title = String(alert.title ?? alert.headline ?? alert.name ?? "Official warning");
    const description = String(alert.description ?? alert.summary ?? "");
    return {
      title,
      link: alert.url ?? alert.link ?? url,
      observedAt: parseTimestamp(alert.updatedAt ?? alert.publishedAt ?? alert.observedAt),
      description,
      matchedAreas: matchedAreasFromText(`${title} ${description}`),
    };
  });
  const matchedAreas = [...new Set(items.flatMap((item) => item.matchedAreas))];
  const observedAt = items.map((item) => item.observedAt).filter(Boolean).sort().at(-1) ?? null;

  return {
    sourceKey: definition.key,
    label: definition.label,
    sourceUrl: url,
    sourceStrength: definition.sourceStrength,
    evidenceType: definition.evidenceType,
    fetchedAt: rawSnapshot.fetchedAt,
    observedAt,
    status: items.length > 0 ? "ok" : "no_items",
    failureReason: items.length > 0 ? null : "warning_feed_empty",
    itemCount: items.length,
    warningCount: items.length,
    matchedAreas,
    items,
  };
}

function parseTransportSnapshot(definition, rawSnapshot, url) {
  const payload =
    typeof rawSnapshot.rawPayload === "string"
      ? JSON.parse(rawSnapshot.rawPayload)
      : rawSnapshot.rawPayload;
  const incidents = Array.isArray(payload?.incidents)
    ? payload.incidents
    : Array.isArray(payload?.features)
      ? payload.features.map((feature) => feature.properties ?? feature)
      : Array.isArray(payload)
        ? payload
        : [];
  const relevantTerms = ["flood", "closure", "closed", "inundation", "water over road"];
  const items = incidents
    .map((incident) => {
      const title = String(incident.title ?? incident.displayName ?? incident.headline ?? "");
      const description = String(incident.description ?? incident.adviceA ?? incident.advice ?? "");
      const combined = `${title} ${description}`.toLowerCase();
      if (!relevantTerms.some((term) => combined.includes(term))) return null;
      return {
        title: title || "Transport incident",
        link: incident.url ?? incident.link ?? url,
        observedAt: parseTimestamp(
          incident.updatedAt ?? incident.lastUpdated ?? incident.start ?? incident.createdAt,
        ),
        description,
        matchedAreas: matchedAreasFromText(combined),
      };
    })
    .filter(Boolean);
  const matchedAreas = [...new Set(items.flatMap((item) => item.matchedAreas))];
  const observedAt = items.map((item) => item.observedAt).filter(Boolean).sort().at(-1) ?? null;

  return {
    sourceKey: definition.key,
    label: definition.label,
    sourceUrl: url,
    sourceStrength: definition.sourceStrength,
    evidenceType: definition.evidenceType,
    fetchedAt: rawSnapshot.fetchedAt,
    observedAt,
    status: items.length > 0 ? "ok" : "no_relevant_incidents",
    failureReason: items.length > 0 ? null : "no_flood_related_incidents",
    itemCount: items.length,
    incidentCount: items.length,
    matchedAreas,
    items,
  };
}

function parseConfiguredSource(definition, payload, url) {
  const { data, metadata } = payload;
  if (definition.key === "hazardwatch_warning_context") {
    const warnings = Array.isArray(data?.warnings) ? data.warnings : [];
    return {
      sourceKey: definition.key,
      label: definition.label,
      sourceUrl: url,
      sourceStrength: definition.sourceStrength,
      evidenceType: definition.evidenceType,
      fetchedAt: metadata.fetchedAt,
      observedAt: data?.observedAt ?? metadata.observedAt ?? null,
      status: metadata.status,
      failureReason: metadata.failureCategory ?? null,
      itemCount: warnings.length,
      warningCount: warnings.length,
      matchedAreas: [...new Set(warnings.flatMap((warning) => matchedAreasFromText(
        `${warning.area ?? ""} ${warning.title ?? ""} ${warning.headline ?? ""}`,
      )))],
      items: warnings.map((warning) => ({
        title: warning.title ?? warning.headline ?? "Official warning",
        link: warning.url ?? url,
        observedAt: warning.issuedAt ?? warning.updatedAt ?? data?.observedAt ?? null,
        description: warning.description ?? "",
        matchedAreas: matchedAreasFromText(
          `${warning.area ?? ""} ${warning.title ?? ""} ${warning.headline ?? ""}`,
        ),
      })),
    };
  }

  return {
    sourceKey: definition.key,
    label: definition.label,
    sourceUrl: url,
    sourceStrength: definition.sourceStrength,
    evidenceType: definition.evidenceType,
    fetchedAt: metadata.fetchedAt,
    observedAt: metadata.observedAt ?? null,
    status: metadata.status,
    failureReason: metadata.failureCategory ?? null,
    itemCount: Array.isArray(data?.stations)
      ? data.stations.length
      : Array.isArray(data?.observations?.data)
        ? data.observations.data.length
        : 0,
    warningCount: 0,
    incidentCount: 0,
    matchedAreas: [],
    items: [],
  };
}

async function collectOneSource(definition, options) {
  const url = candidateUrl(definition);
  const parsedPath = path.join(options.parsedDir, `${definition.key}.jsonl`);
  const rawPath = path.join(options.rawDir, `${definition.key}.jsonl`);

  if (!url) {
    const record = {
      sourceKey: definition.key,
      label: definition.label,
      sourceUrl: null,
      sourceStrength: definition.sourceStrength,
      evidenceType: definition.evidenceType,
      fetchedAt: options.now(),
      observedAt: null,
      status: "not_configured",
      failureReason: "source_url_not_configured",
      itemCount: 0,
      warningCount: 0,
      incidentCount: 0,
      matchedAreas: [],
      items: [],
    };
    await appendJsonlRecord(parsedPath, record);
    return record;
  }

  let rawSnapshot = null;
  try {
    rawSnapshot = await options.rawFetcher(definition, url);
    await appendJsonlRecord(rawPath, {
      sourceKey: definition.key,
      label: definition.label,
      sourceUrl: url,
      sourceStrength: definition.sourceStrength,
      evidenceType: definition.evidenceType,
      fetchedAt: rawSnapshot.fetchedAt,
      httpStatus: rawSnapshot.httpStatus ?? null,
      contentType: rawSnapshot.contentType ?? null,
      rawFormat: definition.rawFormat,
      payload: rawSnapshot.rawPayload,
    });
  } catch (error) {
    const record = {
      sourceKey: definition.key,
      label: definition.label,
      sourceUrl: url,
      sourceStrength: definition.sourceStrength,
      evidenceType: definition.evidenceType,
      fetchedAt: options.now(),
      observedAt: null,
      status: "failed",
      failureReason: fetchFailureCategory(error),
      itemCount: 0,
      warningCount: 0,
      incidentCount: 0,
      matchedAreas: [],
      items: [],
    };
    await appendJsonlRecord(parsedPath, record);
    return record;
  }

  try {
    const parsed = definition.config
      ? parseConfiguredSource(definition, await options.configLoader(definition.config), url)
      : await definition.parsedLoader(definition, rawSnapshot, url);
    await appendJsonlRecord(parsedPath, parsed);
    return parsed;
  } catch (error) {
    const record = {
      sourceKey: definition.key,
      label: definition.label,
      sourceUrl: url,
      sourceStrength: definition.sourceStrength,
      evidenceType: definition.evidenceType,
      fetchedAt: rawSnapshot.fetchedAt,
      observedAt: null,
      status: "failed",
      failureReason: fetchFailureCategory(error),
      itemCount: 0,
      warningCount: 0,
      incidentCount: 0,
      matchedAreas: [],
      items: [],
    };
    await appendJsonlRecord(parsedPath, record);
    return record;
  }
}

export async function collectScheduledSources({
  definitions = buildDefaultDefinitions(),
  rawDir = RAW_DIR,
  parsedDir = PARSED_DIR,
  rawFetcher = defaultRawFetcher,
  configLoader = loadSource,
  now = () => new Date().toISOString(),
} = {}) {
  const options = { rawDir, parsedDir, rawFetcher, configLoader, now };
  const records = [];

  for (const definition of definitions) {
    records.push(await collectOneSource(definition, options));
  }

  return {
    collectedAt: now(),
    sourceCount: records.length,
    liveCount: records.filter((record) => record.status === "ok").length,
    failureCount: records.filter((record) => record.status === "failed").length,
    notConfiguredCount: records.filter((record) => record.status === "not_configured").length,
    records,
  };
}
