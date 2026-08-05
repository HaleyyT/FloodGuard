import { parramattaSignals as localParramattaSignals } from "./parramattaSignals";
import {
  fetchJsonWithTimeout,
  liveDataRequestTimeoutMs,
  serviceWakeRequestTimeoutMs,
} from "./requestPolicy";

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
  return fetchJsonWithTimeout(buildSignalsUrl(areaId, refresh), {
    errorLabel: "FloodGuard signals API",
    signal,
    timeoutMs: liveDataRequestTimeoutMs,
  });
}

export async function fetchFloodguardAreas({ signal } = {}) {
  return fetchJsonWithTimeout(floodguardAreasApiUrl, {
    errorLabel: "FloodGuard areas API",
    signal,
    timeoutMs: serviceWakeRequestTimeoutMs,
  });
}

export async function fetchAreaHistory({ areaId, limit = 12, sinceHours, startTime, endTime, signal } = {}) {
  const url = new URL(floodguardHistoryApiUrl);
  if (areaId) url.searchParams.set("area", areaId);
  url.searchParams.set("limit", String(limit));
  if (sinceHours) url.searchParams.set("sinceHours", String(sinceHours));
  if (startTime) url.searchParams.set("start", startTime);
  if (endTime) url.searchParams.set("end", endTime);

  return fetchJsonWithTimeout(url, { errorLabel: "FloodGuard history API", signal });
}

export async function fetchCommunityReports({ areaId, limit = 10, signal } = {}) {
  const url = new URL(floodguardCommunityReportsApiUrl);
  if (areaId) url.searchParams.set("area", areaId);
  url.searchParams.set("limit", String(limit));

  return fetchJsonWithTimeout(url, {
    errorLabel: "FloodGuard community reports API",
    signal,
  });
}

export async function submitCommunityReport(report, { signal } = {}) {
  return fetchJsonWithTimeout(floodguardCommunityReportsApiUrl, {
    errorLabel: "FloodGuard community reports API",
    init: {
      body: JSON.stringify(report),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    },
    parseError: async (response) => {
      const body = await response.json().catch(() => ({}));
      return body.error;
    },
    signal,
  });
}

export async function fetchEvidenceReviewQueue({ areaId, limit = 8, signal } = {}) {
  const url = new URL(floodguardEvidenceReviewApiUrl);
  if (areaId) url.searchParams.set("area", areaId);
  url.searchParams.set("limit", String(limit));

  return fetchJsonWithTimeout(url, { errorLabel: "FloodGuard evidence review API", signal });
}

export async function fetchAreaFeatures({ areaId, limit = 100, signal } = {}) {
  const url = new URL(floodguardFeaturesApiUrl);
  if (areaId) url.searchParams.set("area", areaId);
  url.searchParams.set("limit", String(limit));

  return fetchJsonWithTimeout(url, { errorLabel: "FloodGuard features API", signal });
}

export async function fetchDatasetQuality({ areaId, limit = 100, signal } = {}) {
  const url = new URL(floodguardDatasetQualityApiUrl);
  if (areaId) url.searchParams.set("area", areaId);
  url.searchParams.set("limit", String(limit));

  return fetchJsonWithTimeout(url, { errorLabel: "FloodGuard dataset quality API", signal });
}

export async function fetchBaselinePrediction({ areaId, limit = 100, signal } = {}) {
  const url = new URL(floodguardBaselineApiUrl);
  if (areaId) url.searchParams.set("area", areaId);
  url.searchParams.set("limit", String(limit));

  return fetchJsonWithTimeout(url, { errorLabel: "FloodGuard baseline API", signal });
}

export async function fetchModelExperiment({ areaId, limit = 100, signal } = {}) {
  const url = new URL(floodguardModelExperimentApiUrl);
  if (areaId) url.searchParams.set("area", areaId);
  url.searchParams.set("limit", String(limit));

  return fetchJsonWithTimeout(url, { errorLabel: "FloodGuard model experiment API", signal });
}

export async function fetchModelCard({ areaId, limit = 100, signal } = {}) {
  const url = new URL(floodguardModelCardApiUrl);
  if (areaId) url.searchParams.set("area", areaId);
  url.searchParams.set("limit", String(limit));

  return fetchJsonWithTimeout(url, { errorLabel: "FloodGuard model card API", signal });
}

export async function fetchMlReport({ signal } = {}) {
  return fetchJsonWithTimeout(floodguardMlReportApiUrl, {
    errorLabel: "FloodGuard ML report API",
    signal,
  });
}

export async function fetchAreaNotifications({ areaId, signal } = {}) {
  const url = new URL(floodguardNotificationsApiUrl);
  if (areaId) url.searchParams.set("area", areaId);

  return fetchJsonWithTimeout(url, { errorLabel: "FloodGuard notifications API", signal });
}

export { localParramattaSignals };
