import { readFile } from "node:fs/promises";

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
  const configuredUrl = process.env[source.envUrl];
  const fetchedAt = new Date().toISOString();

  if (configuredUrl) {
    try {
      return {
        data: await fetchJsonFromUrl(configuredUrl),
        metadata: {
          label: source.label,
          mode: "remote",
          source: configuredUrl,
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

  try {
    return {
      data: await readFallbackJson(source.fallbackFile),
      metadata: {
        label: source.label,
        mode: "local-fallback",
        source: source.fallbackFile,
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
        fetchedAt,
        status: "failed",
        note: error.message,
      },
    };
  }
}
