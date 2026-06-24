import { readFile } from "node:fs/promises";
import { ingestionPolicy } from "./config.js";
import { loadFloodSmartGaugeSource } from "./floodsmartAdapter.js";

async function fetchJsonFromUrl(url) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Fetch failed with ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function readFallbackJson(filePath) {
  const content = await readFile(filePath, "utf8");
  return JSON.parse(content);
}

export async function loadSource(source) {
  const configuredUrl = process.env[source.envUrl] || process.env[source.roadmapEnvUrl] || source.defaultUrl;
  const fetchedAt = new Date().toISOString();

  if (configuredUrl) {
    try {
      return {
        data: source.adapter
          ? await loadFloodSmartGaugeSource(source, configuredUrl)
          : await fetchJsonFromUrl(configuredUrl),
        metadata: {
          label: source.label,
          mode: "remote",
          source: configuredUrl,
          sourceStrength: source.sourceStrength,
          adapter: source.adapter ?? "json",
          fetchedAt,
          status: "ok",
        },
      };
    } catch (error) {
      console.warn(
        `[ingestion] ${source.label} remote fetch failed, using local fallback: ${error.message}`,
      );
    }
  }

  if (!ingestionPolicy.allowLocalFallback) {
    return {
      data: null,
      metadata: {
        label: source.label,
        mode: "unavailable",
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
        mode: "local-fallback",
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
        source: source.fallbackFile,
        sourceStrength: "unavailable",
        fetchedAt,
        status: "failed",
        note: error.message,
      },
    };
  }
}
