import http from "node:http";
import {
  readAreaBaselinePrediction,
  readAreaFeatureDataset,
  readOrRefreshRegionalSignals,
  readHistoricalSignals,
  runRegionalIngestion,
  selectAreaSignals,
} from "./ingestion/aggregators.js";
import { defaultAreaId } from "./ingestion/areaConfig.js";
import { createCommunityReport, readCommunityReports } from "./ingestion/communityReports.js";
import { featureRowsToCsv } from "./ingestion/features.js";

const port = Number(process.env.FLOODGUARD_API_PORT ?? 5174);
const host = process.env.FLOODGUARD_API_HOST ?? "127.0.0.1";

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
    "/api/areas",
    "/api/signals?area=parramatta",
    "/api/signals?area=north-parramatta",
    "/api/signals?area=toongabbie",
    "/api/history?area=parramatta",
    "/api/community-reports?area=parramatta",
    "/api/features?area=parramatta",
    "/api/features?area=parramatta&format=csv",
    "/api/baseline-prediction?area=parramatta",
    "/api/source-health?area=parramatta",
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

function resolveAreaId(url) {
  const queryArea = url.searchParams.get("area");
  if (queryArea) return queryArea;

  const pathMatch = url.pathname.match(
    /^\/api\/(?:signals|rainfall|river|risk|source-health|decision-audit|baseline-prediction)\/([^/]+)$/,
  );
  return pathMatch?.[1] ?? defaultAreaId;
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
    sendJson(response, 200, {
      status: "ok",
      defaultAreaId: regionalSignals.defaultAreaId,
      areaCount: regionalSignals.areaList.length,
      ingestedAt: regionalSignals.ingestedAt,
    });
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

  if (url.pathname === "/api/source-health") {
    sendAreaSignals(response, regionalSignals, resolveAreaId(url), buildSourceHealth);
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
