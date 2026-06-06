import { parramattaSignals as localParramattaSignals } from "./parramattaSignals";

const defaultApiUrl = "http://localhost:5174/api/signals/parramatta";
const defaultAreasUrl = "http://localhost:5174/api/areas";

export const parramattaSignalsApiUrl =
  import.meta.env.VITE_FLOODGUARD_API_URL || defaultApiUrl;
export const floodguardAreasApiUrl =
  import.meta.env.VITE_FLOODGUARD_AREAS_API_URL || defaultAreasUrl;

function buildSignalsUrl(areaId) {
  const url = new URL(parramattaSignalsApiUrl);

  if (areaId) {
    url.pathname = "/api/signals";
    url.searchParams.set("area", areaId);
  }

  return url.toString();
}

export async function fetchParramattaSignals({ areaId, signal } = {}) {
  const response = await fetch(buildSignalsUrl(areaId), { signal });

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
