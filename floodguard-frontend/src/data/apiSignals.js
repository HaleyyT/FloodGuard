import { parramattaSignals as localParramattaSignals } from "./parramattaSignals";

const defaultApiUrl = "http://localhost:5174/api/signals/parramatta";
const defaultAreasUrl = "http://localhost:5174/api/areas";
const defaultHistoryUrl = "http://localhost:5174/api/history";
const defaultCommunityReportsUrl = "http://localhost:5174/api/community-reports";
const defaultEvidenceReviewUrl = "http://localhost:5174/api/evidence-review";
const defaultFeaturesUrl = "http://localhost:5174/api/features";
const defaultDatasetQualityUrl = "http://localhost:5174/api/dataset-quality";
const defaultBaselineUrl = "http://localhost:5174/api/baseline-prediction";
const defaultModelCardUrl = "http://localhost:5174/api/model-card";

export const parramattaSignalsApiUrl =
  import.meta.env.VITE_FLOODGUARD_API_URL || defaultApiUrl;
export const floodguardAreasApiUrl =
  import.meta.env.VITE_FLOODGUARD_AREAS_API_URL || defaultAreasUrl;
export const floodguardHistoryApiUrl =
  import.meta.env.VITE_FLOODGUARD_HISTORY_API_URL || defaultHistoryUrl;
export const floodguardCommunityReportsApiUrl =
  import.meta.env.VITE_FLOODGUARD_COMMUNITY_REPORTS_API_URL || defaultCommunityReportsUrl;
export const floodguardEvidenceReviewApiUrl =
  import.meta.env.VITE_FLOODGUARD_EVIDENCE_REVIEW_API_URL || defaultEvidenceReviewUrl;
export const floodguardFeaturesApiUrl =
  import.meta.env.VITE_FLOODGUARD_FEATURES_API_URL || defaultFeaturesUrl;
export const floodguardDatasetQualityApiUrl =
  import.meta.env.VITE_FLOODGUARD_DATASET_QUALITY_API_URL || defaultDatasetQualityUrl;
export const floodguardBaselineApiUrl =
  import.meta.env.VITE_FLOODGUARD_BASELINE_API_URL || defaultBaselineUrl;
export const floodguardModelCardApiUrl =
  import.meta.env.VITE_FLOODGUARD_MODEL_CARD_API_URL || defaultModelCardUrl;

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

export async function fetchAreaHistory({ areaId, limit = 12, signal } = {}) {
  const url = new URL(floodguardHistoryApiUrl);
  if (areaId) url.searchParams.set("area", areaId);
  url.searchParams.set("limit", String(limit));

  const response = await fetch(url, { signal });

  if (!response.ok) {
    throw new Error(`FloodGuard history API returned ${response.status}`);
  }

  return response.json();
}

export async function fetchCommunityReports({ areaId, limit = 10, signal } = {}) {
  const url = new URL(floodguardCommunityReportsApiUrl);
  if (areaId) url.searchParams.set("area", areaId);
  url.searchParams.set("limit", String(limit));

  const response = await fetch(url, { signal });

  if (!response.ok) {
    throw new Error(`FloodGuard community reports API returned ${response.status}`);
  }

  return response.json();
}

export async function submitCommunityReport(report, { signal } = {}) {
  const response = await fetch(floodguardCommunityReportsApiUrl, {
    body: JSON.stringify(report),
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
    signal,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `FloodGuard community reports API returned ${response.status}`);
  }

  return response.json();
}

export async function fetchEvidenceReviewQueue({ areaId, limit = 8, signal } = {}) {
  const url = new URL(floodguardEvidenceReviewApiUrl);
  if (areaId) url.searchParams.set("area", areaId);
  url.searchParams.set("limit", String(limit));

  const response = await fetch(url, { signal });

  if (!response.ok) {
    throw new Error(`FloodGuard evidence review API returned ${response.status}`);
  }

  return response.json();
}

export async function fetchAreaFeatures({ areaId, limit = 100, signal } = {}) {
  const url = new URL(floodguardFeaturesApiUrl);
  if (areaId) url.searchParams.set("area", areaId);
  url.searchParams.set("limit", String(limit));

  const response = await fetch(url, { signal });

  if (!response.ok) {
    throw new Error(`FloodGuard features API returned ${response.status}`);
  }

  return response.json();
}

export async function fetchDatasetQuality({ areaId, limit = 100, signal } = {}) {
  const url = new URL(floodguardDatasetQualityApiUrl);
  if (areaId) url.searchParams.set("area", areaId);
  url.searchParams.set("limit", String(limit));

  const response = await fetch(url, { signal });

  if (!response.ok) {
    throw new Error(`FloodGuard dataset quality API returned ${response.status}`);
  }

  return response.json();
}

export async function fetchBaselinePrediction({ areaId, limit = 100, signal } = {}) {
  const url = new URL(floodguardBaselineApiUrl);
  if (areaId) url.searchParams.set("area", areaId);
  url.searchParams.set("limit", String(limit));

  const response = await fetch(url, { signal });

  if (!response.ok) {
    throw new Error(`FloodGuard baseline API returned ${response.status}`);
  }

  return response.json();
}

export async function fetchModelCard({ areaId, limit = 100, signal } = {}) {
  const url = new URL(floodguardModelCardApiUrl);
  if (areaId) url.searchParams.set("area", areaId);
  url.searchParams.set("limit", String(limit));

  const response = await fetch(url, { signal });

  if (!response.ok) {
    throw new Error(`FloodGuard model card API returned ${response.status}`);
  }

  return response.json();
}

export { localParramattaSignals };
