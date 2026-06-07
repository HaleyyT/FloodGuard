import { parramattaSignals as localParramattaSignals } from "./parramattaSignals";

const defaultApiUrl = "http://localhost:5174/api/signals/parramatta";
const defaultAreasUrl = "http://localhost:5174/api/areas";

export const parramattaSignalsApiUrl =
  import.meta.env.VITE_FLOODGUARD_API_URL || defaultApiUrl;
export const floodguardAreasApiUrl =
  import.meta.env.VITE_FLOODGUARD_AREAS_API_URL || defaultAreasUrl;

function buildSignalsUrl(areaId, refresh = false) {
  const url = new URL(parramattaSignalsApiUrl);

  if (areaId) {
    url.pathname = "/api/signals";
    url.searchParams.set("area", areaId);
  }

  if (refresh) {
    url.searchParams.set("refresh", "true");
  }

  return url.toString();
}

export async function fetchParramattaSignals({ areaId, refresh = false, signal } = {}) {
  const response = await fetch(buildSignalsUrl(areaId, refresh), { signal });

  if (!response.ok) {
    throw new Error(`FloodGuard API returned ${response.status}`);
  }

  return response.json();
}

export async function fetchFloodguardAreas({ signal } = {}) {
  const response = await fetch(floodguardAreasApiUrl, { signal });

  if (!response.ok) {
    throw new Error(`FloodGuard areas API returned ${response.status}`);
  }

  return response.json();
}

export { localParramattaSignals };
