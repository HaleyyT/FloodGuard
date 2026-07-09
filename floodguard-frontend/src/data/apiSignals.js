import { parramattaSignals as localParramattaSignals } from "./parramattaSignals";

const defaultApiBaseUrl = "http://127.0.0.1:5174";
const defaultApiUrl = `${defaultApiBaseUrl}/api/signals/parramatta`;
const defaultAreasUrl = `${defaultApiBaseUrl}/api/areas`;
const defaultHistoryUrl = `${defaultApiBaseUrl}/api/history`;
const defaultCommunityReportsUrl = `${defaultApiBaseUrl}/api/community-reports`;
const defaultEvidenceReviewUrl = `${defaultApiBaseUrl}/api/evidence-review`;
const defaultFeaturesUrl = `${defaultApiBaseUrl}/api/features`;
const defaultDatasetQualityUrl = `${defaultApiBaseUrl}/api/dataset-quality`;
const defaultBaselineUrl = `${defaultApiBaseUrl}/api/baseline-prediction`;
const defaultModelExperimentUrl = `${defaultApiBaseUrl}/api/model-experiment`;
const defaultModelCardUrl = `${defaultApiBaseUrl}/api/model-card`;
const defaultMlReportUrl = `${defaultApiBaseUrl}/api/ml/report`;
const defaultNotificationsUrl = `${defaultApiBaseUrl}/api/notifications`;

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
export const floodguardModelExperimentApiUrl =
  import.meta.env.VITE_FLOODGUARD_MODEL_EXPERIMENT_API_URL || defaultModelExperimentUrl;
export const floodguardModelCardApiUrl =
  import.meta.env.VITE_FLOODGUARD_MODEL_CARD_API_URL || defaultModelCardUrl;
export const floodguardMlReportApiUrl =
  import.meta.env.VITE_FLOODGUARD_ML_REPORT_API_URL || defaultMlReportUrl;
export const floodguardNotificationsApiUrl =
  import.meta.env.VITE_FLOODGUARD_NOTIFICATIONS_API_URL || defaultNotificationsUrl;

function buildSignalsUrl(areaId, refresh = false) {
  const url = new URL(parramattaSignalsApiUrl);

  if (areaId) {
    url.pathname = `/api/signals/${areaId}`;
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

export async function fetchAreaHistory({ areaId, limit = 12, sinceHours, startTime, endTime, signal } = {}) {
  const url = new URL(floodguardHistoryApiUrl);
  if (areaId) url.searchParams.set("area", areaId);
  url.searchParams.set("limit", String(limit));
  if (sinceHours) url.searchParams.set("sinceHours", String(sinceHours));
  if (startTime) url.searchParams.set("start", startTime);
  if (endTime) url.searchParams.set("end", endTime);

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

export async function fetchModelExperiment({ areaId, limit = 100, signal } = {}) {
  const url = new URL(floodguardModelExperimentApiUrl);
  if (areaId) url.searchParams.set("area", areaId);
  url.searchParams.set("limit", String(limit));

  const response = await fetch(url, { signal });

  if (!response.ok) {
    throw new Error(`FloodGuard model experiment API returned ${response.status}`);
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

export async function fetchMlReport({ signal } = {}) {
  const response = await fetch(floodguardMlReportApiUrl, { signal });

  if (!response.ok) {
    throw new Error(`FloodGuard ML report API returned ${response.status}`);
  }

  return response.json();
}

export async function fetchAreaNotifications({ areaId, signal } = {}) {
  const url = new URL(floodguardNotificationsApiUrl);
  if (areaId) url.searchParams.set("area", areaId);

  const response = await fetch(url, { signal });

  if (!response.ok) {
    throw new Error(`FloodGuard notifications API returned ${response.status}`);
  }

  return response.json();
}

export { localParramattaSignals };
