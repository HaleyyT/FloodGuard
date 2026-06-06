import http from "node:http";
import { readOrRefreshParramattaSignals, runParramattaIngestion } from "./ingestion/parramattaPipeline.js";

const port = Number(process.env.FLOODGUARD_API_PORT ?? 5174);

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,OPTIONS",
    "access-control-allow-headers": "content-type",
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body, null, 2));
}

async function routeRequest(request, response) {
  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  if (request.method !== "GET") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host}`);
  const shouldRefresh = url.searchParams.get("refresh") === "true";
  const signals = shouldRefresh
    ? await runParramattaIngestion()
    : await readOrRefreshParramattaSignals();

  if (url.pathname === "/api/health") {
    sendJson(response, 200, {
      status: "ok",
      location: signals.location.name,
      ingestedAt: signals.ingestedAt,
    });
    return;
  }

  if (url.pathname === "/api/signals/parramatta") {
    sendJson(response, 200, signals);
    return;
  }

  if (url.pathname === "/api/rainfall/parramatta") {
    sendJson(response, 200, signals.rainfallSeries);
    return;
  }

  if (url.pathname === "/api/river/parramatta") {
    sendJson(response, 200, signals.riverContext);
    return;
  }

  if (url.pathname === "/api/risk/parramatta") {
    sendJson(response, 200, signals.riskAssessment);
    return;
  }

  sendJson(response, 404, {
    error: "Not found",
    routes: [
      "/api/health",
      "/api/signals/parramatta",
      "/api/rainfall/parramatta",
      "/api/river/parramatta",
      "/api/risk/parramatta",
    ],
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

server.listen(port, () => {
  console.log(`FloodGuard API listening at http://localhost:${port}`);
});
