import { readFile } from "node:fs/promises";
import { ingestionPolicy, sourceCacheDir } from "./config.js";
import { loadFloodSmartGaugeSource } from "./floodsmartAdapter.js";
import { readSourceCache, writeSourceCache } from "./store.js";

function cacheKeyForSource(source) {
  return source.adapter ?? source.label.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-");
}

async function readFallbackJson(filePath) {
  const content = await readFile(filePath, "utf8");
  return JSON.parse(content);
}

async function fetchJsonFromUrl(url) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
    },
    signal: AbortSignal.timeout(ingestionPolicy.fetchTimeoutMs),
  });

  if (!response.ok) {
    throw new Error(`Fetch failed with ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function fetchWithRetry(url, attempts = ingestionPolicy.retryCount + 1) {
  let lastError = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fetchJsonFromUrl(url);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

function parseTimestamp(value) {
  if (!value) return null;

  if (/^\d{14}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(
      8,
      10,
    )}:${value.slice(10, 12)}:${value.slice(12, 14)}+10:00`;
  }

  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

function extractObservedAt(source, data) {
  if (!data) return null;

  if (source.adapter?.startsWith("floodsmart-")) {
    const stationTimes = (data.stations ?? []).map((station) => parseTimestamp(station.observedAt)).filter(Boolean);
    return stationTimes.sort().at(-1) ?? null;
  }

  if (data?.observations?.data?.[0]?.local_date_time_full) {
    return parseTimestamp(data?.observations?.data?.[0]?.local_date_time_full);
  }

  return parseTimestamp(data?.observedAt ?? data?.issuedAt ?? data?.updatedAt ?? null);
}

function minutesBetween(start, end) {
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();

  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return null;

  return Math.max(0, Math.round((endMs - startMs) / (60 * 1000)));
}

function staleAfterMinutes(source) {
  const hours = ingestionPolicy.maxAgeHours[source.adapter === "floodsmart-rainfall" ? "rainfall" : source.adapter === "floodsmart-river" ? "river" : source.envUrl === "FLOODGUARD_WARNINGS_URL" ? "warnings" : "weather"] ?? 1;
  return Math.round(hours * 60);
}

function cacheMetadata(source, data, fetchedAt) {
  return {
    observedAt: extractObservedAt(source, data),
    fetchedAt,
  };
}

export async function loadSource(source) {
  const configuredUrl = process.env[source.envUrl] || process.env[source.roadmapEnvUrl] || source.defaultUrl;
  const fetchedAt = new Date().toISOString();
  const cacheKey = cacheKeyForSource(source);

  if (!configuredUrl && source.optional) {
    return {
      data: null,
      metadata: {
        label: source.label,
        mode: "not-configured",
        dataMode: "missing",
        source: null,
        sourceStrength: source.sourceStrength,
        fetchedAt,
        status: "not-connected",
        note: `${source.envUrl} is not configured.`,
      },
    };
  }

  if (configuredUrl) {
    try {
      const data = source.adapter
        ? await loadFloodSmartGaugeSource(source, configuredUrl)
        : await fetchWithRetry(configuredUrl);
      await writeSourceCache(sourceCacheDir, cacheKey, {
        data,
        metadata: cacheMetadata(source, data, fetchedAt),
      });

      return {
        data,
        metadata: {
          label: source.label,
          mode: "remote",
          dataMode: "live",
          source: configuredUrl,
          sourceStrength: source.sourceStrength,
          adapter: source.adapter ?? "json",
          fetchedAt,
          status: "ok",
        },
      };
    } catch (error) {
      const cached = await readSourceCache(sourceCacheDir, cacheKey);
      const cacheObservedAt = cached?.metadata?.observedAt ?? null;
      const cacheAgeMinutes = cacheObservedAt ? minutesBetween(cacheObservedAt, fetchedAt) : null;
      const recentThresholdMinutes = ingestionPolicy.cacheRecentMaxMinutes;
      const staleThresholdMinutes = staleAfterMinutes(source);
      const dataMode =
        cacheAgeMinutes !== null && cacheAgeMinutes <= recentThresholdMinutes
          ? "cached_recent"
          : cached
            ? "cached_stale"
            : null;

      if (cached && dataMode) {
        return {
          data: cached.data,
          metadata: {
            label: source.label,
            mode: dataMode,
            dataMode,
            source: configuredUrl,
            sourceStrength: source.sourceStrength,
            adapter: source.adapter ?? "json",
            fetchedAt,
            status: cacheAgeMinutes !== null && cacheAgeMinutes <= staleThresholdMinutes ? "ok" : "failed",
            observedAt: cacheObservedAt,
            note:
              dataMode === "cached_recent"
                ? `Remote fetch failed; recent cached reading was used instead (${cacheAgeMinutes} minutes old).`
                : `Remote fetch failed and only stale cached data is available (${cacheAgeMinutes ?? "unknown"} minutes old).`,
          },
        };
      }

      console.warn(`[ingestion] ${source.label} remote fetch failed, using local fallback: ${error.message}`);
    }
  }

  if (!ingestionPolicy.allowLocalFallback) {
    return {
      data: null,
      metadata: {
        label: source.label,
        mode: "unavailable",
        dataMode: "missing",
        source: source.fallbackFile,
        sourceStrength: "unavailable",
        fetchedAt,
        status: "failed",
        note: "Local fallback is disabled by FLOODGUARD_ALLOW_LOCAL_FALLBACK.",
      },
    };
  }

  try {
    return {
      data: await readFallbackJson(source.fallbackFile),
      metadata: {
        label: source.label,
        mode: "local_demo_fallback",
        dataMode: "local_demo_fallback",
        source: source.fallbackFile,
        sourceStrength: "local_fallback",
        fetchedAt,
        status: "ok",
      },
    };
  } catch (error) {
    return {
      data: null,
      metadata: {
        label: source.label,
        mode: "unavailable",
        dataMode: "missing",
        source: source.fallbackFile,
        sourceStrength: "unavailable",
        fetchedAt,
        status: "failed",
        note: error.message,
      },
    };
  }
}
