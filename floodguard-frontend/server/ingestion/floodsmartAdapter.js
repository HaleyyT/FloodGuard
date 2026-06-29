const eventPageSize = 24;
const maxStationPages = 10;

const riverStationNameMap = {
  "567057": "Darling Mills Creek at North Parramatta",
  "567107": "Parramatta River at Marsden Weir",
  "567112": "Parramatta River at Riverside Theatre",
  "567058": "Toongabbie Creek at Johnstons Bridge",
  "567074": "Toongabbie Creek at Briens Rd",
  "567056": "Toongabbie Creek at Redbank Road",
};

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Fetch failed with ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function fetchPaginatedJson(url) {
  const results = [];
  let nextUrl = url;

  for (let page = 0; nextUrl && page < maxStationPages; page += 1) {
    const payload = await fetchJson(nextUrl);
    results.push(...(payload.results ?? []));
    nextUrl = payload.next;
  }

  return results;
}

function timeseriesEventsUrl(timeseriesUrl) {
  const url = new URL(timeseriesUrl);
  url.pathname = url.pathname.replace(/\/$/, "").replace(/\/timeseries\/([^/]+)$/, "/timeseries/$1/events/");
  url.search = "";
  url.searchParams.set("format", "json");
  url.searchParams.set("ordering", "-time");
  url.searchParams.set("page_size", String(eventPageSize));
  return url.toString();
}

function metricMatches(timeseries, metric) {
  const parameter = timeseries.observation_type?.parameter?.toLowerCase() ?? "";
  const unit = timeseries.observation_type?.unit?.toLowerCase() ?? "";

  if (metric === "rainfall") return parameter.includes("precipitation") || unit === "mm";
  return parameter.includes("water level") || unit === "m";
}

function stationMatchesMetric(station, metric) {
  const category = station.category?.toLowerCase() ?? "";
  if (metric === "rainfall") return category.includes("rain");
  return category.includes("river");
}

async function hydrateStation(station, metric) {
  const timeseries = await Promise.all(
    (station.timeseries ?? []).map(async (url) => fetchJson(url)),
  );
  const selectedTimeseries = timeseries.find((item) => metricMatches(item, metric)) ?? timeseries[0];
  const eventUrl = selectedTimeseries?.url ? timeseriesEventsUrl(selectedTimeseries.url) : null;
  const eventsPayload = eventUrl
    ? await fetchJson(eventUrl).catch((error) => ({
        results: [],
        error: error.message,
      }))
    : { results: [] };
  const events = (eventsPayload.results ?? []).map((event) => ({
    time: event.time,
    value: event.value,
    validationCode: event.validation_code,
    lastModified: event.last_modified,
  }));
  const latestEvent = events[0] ?? null;
  const [lon, lat] = station.geometry?.coordinates ?? [];

  return {
    code: String(station.code),
    stationName: station.name,
    normalizedStationName:
      metric === "river" ? riverStationNameMap[String(station.code)] ?? station.name : station.name,
    category: station.category,
    frequency: station.frequency || null,
    lat,
    lon,
    metric,
    unit: selectedTimeseries?.observation_type?.unit ?? null,
    parameter: selectedTimeseries?.observation_type?.parameter ?? null,
    timeseriesUrl: selectedTimeseries?.url ?? null,
    observedAt: latestEvent?.time ?? selectedTimeseries?.end ?? null,
    latestValue: latestEvent?.value ?? selectedTimeseries?.last_value ?? null,
    lastModified: latestEvent?.lastModified ?? selectedTimeseries?.last_modified ?? null,
    eventStatus: eventsPayload.error ? "fallback-to-timeseries-summary" : "ok",
    eventNote: eventsPayload.error ?? null,
    dataMode: eventsPayload.error ? "live_summary_fallback" : "live",
    qualityNotes: eventsPayload.error
      ? [
          "Detailed event rows were unavailable.",
          "The official timeseries summary end/last_value was used instead.",
        ]
      : ["Detailed live event rows were used."],
    events,
  };
}

export async function loadFloodSmartGaugeSource(source, configuredUrl) {
  const stations = await fetchPaginatedJson(configuredUrl);
  const stationCodes = new Set((source.stationCodes ?? []).map(String));
  const metric = source.adapter === "floodsmart-rainfall" ? "rainfall" : "river";
  const selectedStations = stations.filter(
    (station) =>
      stationCodes.has(String(station.code)) &&
      stationMatchesMetric(station, metric) &&
      (station.timeseries ?? []).length > 0,
  );

  const stationResults = await Promise.allSettled(
    selectedStations.map((station) => hydrateStation(station, metric)),
  );
  const hydratedStations = stationResults
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value);
  const failedStations = stationResults
    .filter((result) => result.status === "rejected")
    .map((result) => result.reason.message);

  return {
    provider: "City of Parramatta FloodSmart",
    metric,
    stationCount: hydratedStations.length,
    failedStationCount: failedStations.length,
    failedStations,
    stations: hydratedStations,
  };
}
