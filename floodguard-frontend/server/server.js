import http from "node:http";
import {
  readAreaBaselinePrediction,
  readAreaDatasetQuality,
  readAreaFeatureDataset,
  readAreaModelCard,
  readOrRefreshRegionalSignals,
  readHistoricalSignals,
  readSpatialRelevance,
  runRegionalIngestion,
  selectAreaSignals,
} from "./ingestion/aggregators.js";
import { defaultAreaId } from "./ingestion/areaConfig.js";
import {
  buildImageEvidenceReviewQueue,
  createCommunityReport,
  readCommunityReports,
} from "./ingestion/communityReports.js";
import { featureRowsToCsv } from "./ingestion/features.js";
import { buildRegionalIngestionHealth } from "./ingestion/health.js";

const port = Number(process.env.FLOODGUARD_API_PORT ?? 5174);
const host = process.env.FLOODGUARD_API_HOST ?? "127.0.0.1";
const reportRateLimits = new Map();
const reportRateLimitWindowMs = 10 * 60 * 1000;
const maxReportsPerWindow = 5;

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body, null, 2));
}

function sendText(response, statusCode, body, contentType = "text/plain; charset=utf-8") {
  response.writeHead(statusCode, {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,OPTIONS",
    "access-control-allow-headers": "content-type",
    "content-type": contentType,
  });
  response.end(body);
}

function routes() {
  return [
    "/api/health",
    "/api/ingestion-health",
    "/api/areas",
    "/api/signals?area=parramatta",
    "/api/signals?area=north-parramatta",
    "/api/signals?area=toongabbie",
    "/api/history?area=parramatta",
    "/api/community-reports?area=parramatta",
    "/api/evidence-review?area=parramatta",
    "/api/features?area=parramatta",
    "/api/features?area=parramatta&format=csv",
    "/api/dataset-quality?area=parramatta",
    "/api/baseline-prediction?area=parramatta",
    "/api/model-card?area=parramatta",
    "/api/source-health?area=parramatta",
    "/api/spatial-relevance?area=parramatta",
    "/api/spatial-relevance?lat=-33.8&lon=151",
    "/api/signals/parramatta",
    "/api/rainfall/parramatta",
    "/api/river/parramatta",
    "/api/risk/parramatta",
    "/api/decision-audit?area=parramatta",
  ];
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 10000) {
        reject(new Error("Request body is too large."));
        request.destroy();
      }
    });

    request.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Request body must be valid JSON."));
      }
    });

    request.on("error", reject);
  });
}

function clientKey(request) {
  const forwardedFor = request.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.length > 0) {
    return forwardedFor.split(",")[0].trim();
  }

  return request.socket.remoteAddress || "unknown-client";
}

function checkReportRateLimit(request) {
  const key = clientKey(request);
  const now = Date.now();
  const current = reportRateLimits.get(key) ?? {
    count: 0,
    resetAt: now + reportRateLimitWindowMs,
  };

  if (now > current.resetAt) {
    current.count = 0;
    current.resetAt = now + reportRateLimitWindowMs;
  }

  current.count += 1;
  reportRateLimits.set(key, current);

  return {
    allowed: current.count <= maxReportsPerWindow,
    retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
  };
}

function acceptsJson(request) {
  const contentType = request.headers["content-type"] || "";
  return contentType.toLowerCase().includes("application/json");
}

function resolveAreaId(url) {
  const queryArea = url.searchParams.get("area");
  if (queryArea) return queryArea;

  const pathMatch = url.pathname.match(
    /^\/api\/(?:signals|rainfall|river|risk|source-health|decision-audit|baseline-prediction)\/([^/]+)$/,
  );
  return pathMatch?.[1] ?? defaultAreaId;
}

function parseCoordinate(value) {
  if (value === null) return null;
  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? coordinate : null;
}

function buildSourceHealth(areaSignals) {
  return {
    area: areaSignals.area,
    freshness: areaSignals.freshness,
    dataQuality: areaSignals.dataQuality,
    sources: areaSignals.sourceMetadata.map((metadata) => ({
      label: metadata.label,
      type: metadata.type,
      mode: metadata.mode,
      status: metadata.status ?? "ok",
      source: metadata.source,
      fetchedAt: metadata.fetchedAt,
      observedAt: metadata.observedAt,
      ageHours: metadata.ageHours,
      staleAfterHours: metadata.staleAfterHours,
      freshnessStatus: metadata.freshnessStatus,
      note: metadata.note,
      areaRelevance: metadata.areaRelevance,
    })),
  };
}

function sendAreaSignals(response, regionalSignals, areaId, selector) {
  const areaSignals = selectAreaSignals(regionalSignals, areaId);

  if (!areaSignals) {
    sendJson(response, 404, {
      error: `Unknown area: ${areaId}`,
      availableAreas: regionalSignals.areaList,
    });
    return;
  }

  sendJson(response, 200, selector(areaSignals));
}

async function routeRequest(request, response) {
  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host}`);

  if (request.method === "POST" && url.pathname === "/api/community-reports") {
    try {
      if (!acceptsJson(request)) {
        sendJson(response, 415, { error: "Content-Type must be application/json." });
        return;
      }

      const rateLimit = checkReportRateLimit(request);
      if (!rateLimit.allowed) {
        sendJson(response, 429, {
          error: "Too many community reports. Please wait before submitting again.",
          retryAfterSeconds: rateLimit.retryAfterSeconds,
        });
        return;
      }

      const body = await readJsonBody(request);
      const report = await createCommunityReport(body);
      sendJson(response, 201, report);
    } catch (error) {
      sendJson(response, error.statusCode ?? 400, { error: error.message });
    }
    return;
  }

  if (request.method !== "GET") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  const shouldRefresh = url.searchParams.get("refresh") === "true";
  const regionalSignals = shouldRefresh
    ? await runRegionalIngestion()
    : await readOrRefreshRegionalSignals();

  if (url.pathname === "/api/health") {
    const ingestionHealth = buildRegionalIngestionHealth(regionalSignals);

    sendJson(response, 200, {
      status: "ok",
      defaultAreaId: regionalSignals.defaultAreaId,
      areaCount: regionalSignals.areaList.length,
      ingestedAt: regionalSignals.ingestedAt,
      ingestionHealth: {
        status: ingestionHealth.status,
        ready: ingestionHealth.ready,
        blockedAreaCount: ingestionHealth.blockedAreaCount,
        warningAreaCount: ingestionHealth.warningAreaCount,
      },
    });
    return;
  }

  if (url.pathname === "/api/ingestion-health") {
    sendJson(response, 200, buildRegionalIngestionHealth(regionalSignals));
    return;
  }

  if (url.pathname === "/api/areas") {
    sendJson(response, 200, regionalSignals.areaList);
    return;
  }

  if (url.pathname === "/api/history") {
    const areaId = resolveAreaId(url);
    const limit = Number(url.searchParams.get("limit") ?? 24);

    if (!selectAreaSignals(regionalSignals, areaId)) {
      sendJson(response, 404, {
        error: `Unknown area: ${areaId}`,
        availableAreas: regionalSignals.areaList,
      });
      return;
    }

    sendJson(response, 200, await readHistoricalSignals(areaId, limit));
    return;
  }

  if (url.pathname === "/api/community-reports") {
    const areaId = resolveAreaId(url);
    const limit = Number(url.searchParams.get("limit") ?? 20);

    if (!selectAreaSignals(regionalSignals, areaId)) {
      sendJson(response, 404, {
        error: `Unknown area: ${areaId}`,
        availableAreas: regionalSignals.areaList,
      });
      return;
    }

    sendJson(response, 200, await readCommunityReports(areaId, limit));
    return;
  }

  if (url.pathname === "/api/evidence-review") {
    const areaId = resolveAreaId(url);
    const limit = Number(url.searchParams.get("limit") ?? 20);

    if (!selectAreaSignals(regionalSignals, areaId)) {
      sendJson(response, 404, {
        error: `Unknown area: ${areaId}`,
        availableAreas: regionalSignals.areaList,
      });
      return;
    }

    const reports = await readCommunityReports(areaId, Math.min(Math.max(limit * 2, 20), 100));
    sendJson(response, 200, {
      areaId,
      ...buildImageEvidenceReviewQueue(reports, limit),
    });
    return;
  }

  if (url.pathname === "/api/features") {
    const areaId = resolveAreaId(url);
    const limit = Number(url.searchParams.get("limit") ?? 100);
    const format = url.searchParams.get("format") ?? "json";

    if (!selectAreaSignals(regionalSignals, areaId)) {
      sendJson(response, 404, {
        error: `Unknown area: ${areaId}`,
        availableAreas: regionalSignals.areaList,
      });
      return;
    }

    const dataset = await readAreaFeatureDataset(areaId, limit);

    if (format === "csv") {
      sendText(response, 200, featureRowsToCsv(dataset.rows), "text/csv; charset=utf-8");
      return;
    }

    sendJson(response, 200, dataset);
    return;
  }

  if (url.pathname === "/api/baseline-prediction") {
    const areaId = resolveAreaId(url);
    const limit = Number(url.searchParams.get("limit") ?? 100);

    if (!selectAreaSignals(regionalSignals, areaId)) {
      sendJson(response, 404, {
        error: `Unknown area: ${areaId}`,
        availableAreas: regionalSignals.areaList,
      });
      return;
    }

    sendJson(response, 200, await readAreaBaselinePrediction(areaId, limit));
    return;
  }

  if (url.pathname === "/api/dataset-quality") {
    const areaId = resolveAreaId(url);
    const limit = Number(url.searchParams.get("limit") ?? 100);

    if (!selectAreaSignals(regionalSignals, areaId)) {
      sendJson(response, 404, {
        error: `Unknown area: ${areaId}`,
        availableAreas: regionalSignals.areaList,
      });
      return;
    }

    sendJson(response, 200, await readAreaDatasetQuality(areaId, limit));
    return;
  }

  if (url.pathname === "/api/model-card") {
    const areaId = resolveAreaId(url);
    const limit = Number(url.searchParams.get("limit") ?? 100);

    if (!selectAreaSignals(regionalSignals, areaId)) {
      sendJson(response, 404, {
        error: `Unknown area: ${areaId}`,
        availableAreas: regionalSignals.areaList,
      });
      return;
    }

    sendJson(response, 200, await readAreaModelCard(areaId, limit));
    return;
  }

  if (url.pathname === "/api/source-health") {
    sendAreaSignals(response, regionalSignals, resolveAreaId(url), buildSourceHealth);
    return;
  }

  if (url.pathname === "/api/spatial-relevance") {
    const areaId = url.searchParams.get("area");
    const lat = parseCoordinate(url.searchParams.get("lat"));
    const lon = parseCoordinate(url.searchParams.get("lon"));
    const result = readSpatialRelevance({ areaId, lat, lon });

    if (!result) {
      sendJson(response, 400, {
        error: "Provide a known area or valid lat/lon coordinates.",
        availableAreas: regionalSignals.areaList,
      });
      return;
    }

    sendJson(response, 200, result);
    return;
  }

  if (url.pathname === "/api/decision-audit") {
    sendAreaSignals(
      response,
      regionalSignals,
      resolveAreaId(url),
      (signals) => signals.riskAssessment.decisionAudit,
    );
    return;
  }

  if (url.pathname === "/api/signals") {
    sendAreaSignals(response, regionalSignals, resolveAreaId(url), (signals) => signals);
    return;
  }

  if (url.pathname.startsWith("/api/signals/")) {
    sendAreaSignals(response, regionalSignals, resolveAreaId(url), (signals) => signals);
    return;
  }

  if (url.pathname.startsWith("/api/rainfall/")) {
    sendAreaSignals(response, regionalSignals, resolveAreaId(url), (signals) => signals.rainfallSeries);
    return;
  }

  if (url.pathname.startsWith("/api/river/")) {
    sendAreaSignals(response, regionalSignals, resolveAreaId(url), (signals) => signals.riverContext);
    return;
  }

  if (url.pathname.startsWith("/api/risk/")) {
    sendAreaSignals(response, regionalSignals, resolveAreaId(url), (signals) => signals.riskAssessment);
    return;
  }

  if (url.pathname.startsWith("/api/source-health/")) {
    sendAreaSignals(response, regionalSignals, resolveAreaId(url), buildSourceHealth);
    return;
  }

  if (url.pathname.startsWith("/api/decision-audit/")) {
    sendAreaSignals(
      response,
      regionalSignals,
      resolveAreaId(url),
      (signals) => signals.riskAssessment.decisionAudit,
    );
    return;
  }

  if (url.pathname.startsWith("/api/baseline-prediction/")) {
    const areaId = resolveAreaId(url);
    const limit = Number(url.searchParams.get("limit") ?? 100);

    if (!selectAreaSignals(regionalSignals, areaId)) {
      sendJson(response, 404, {
        error: `Unknown area: ${areaId}`,
        availableAreas: regionalSignals.areaList,
      });
      return;
    }

    sendJson(response, 200, await readAreaBaselinePrediction(areaId, limit));
    return;
  }

  sendJson(response, 404, {
    error: "Not found",
    routes: routes(),
  });
}

const server = http.createServer((request, response) => {
  routeRequest(request, response).catch((error) => {
    console.error(error);
    sendJson(response, 500, {
      error: "FloodGuard API failed to serve this request",
      detail: error.message,
    });
  });
});

server.listen(port, host, () => {
  console.log(`FloodGuard API listening at http://${host}:${port}`);
});
