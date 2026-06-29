import { useCallback, useEffect, useState } from "react";
import "./App.css";
import {
  ResponsiveContainer,
  BarChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Bar,
  Cell,
  ReferenceLine,
} from "recharts";

import { buildPublicSignalCards } from "./data/parramattaSignals";
import {
  fetchBaselinePrediction,
  fetchAreaFeatures,
  fetchAreaHistory,
  fetchDatasetQuality,
  fetchCommunityReports,
  fetchEvidenceReviewQueue,
  fetchFloodguardAreas,
  fetchModelCard,
  fetchModelExperiment,
  fetchParramattaSignals,
  localParramattaSignals,
  submitCommunityReport,
} from "./data/apiSignals";

const fallbackAreas = [
  {
    id: "parramatta",
    name: "Parramatta, NSW",
    catchment: "Parramatta River",
  },
  {
    id: "north-parramatta",
    name: "North Parramatta, NSW",
    catchment: "Darling Mills Creek / Parramatta River",
  },
  {
    id: "toongabbie",
    name: "Toongabbie, NSW",
    catchment: "Toongabbie Creek",
  },
];

const liveRefreshIntervalMs = Number(
  import.meta.env.VITE_FLOODGUARD_REFRESH_MS || 60000
);
const appSections = [
  { id: "overview", label: "Overview" },
  { id: "signals", label: "Signals" },
  { id: "community", label: "Community" },
  { id: "model", label: "Model" },
  { id: "architecture", label: "Architecture" },
];

// #river monitoring card
function RiverStatusPanel({ areaName, riverSummary }) {
  return (
    <section className="card river-status-card">
      <div className="section-header compact">
        <div>
          <p className="section-label">River monitoring</p>
          <h3>{areaName.replace(", NSW", "")} river status</h3>
        </div>
      </div>

      <div className="river-grid">
        <div className="info-tile">
          <p className="section-label">Primary station</p>
          <h3>{riverSummary.primaryStationName}</h3>
        </div>

        <div className="info-tile">
          <p className="section-label">Current height</p>
          <h3>{riverSummary.primaryHeight} m</h3>
        </div>

        <div className="info-tile">
          <p className="section-label">Tendency</p>
          <h3>{riverSummary.primaryTendency}</h3>
        </div>

        <div className="info-tile">
          <p className="section-label">Stations in feed</p>
          <h3>{riverSummary.stationCount}</h3>
        </div>
      </div>
    </section>
  );
}


function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

// helper function to build risk signals based on the prototype inputs, with some simple heuristics to combine them into a score out of 100 for each category
function buildRiskSignals(signals) {
  const backendSignals = signals.riskAssessment?.signals;

  if (backendSignals) {
    return [
      { name: "Rainfall", value: backendSignals.rainfallPressure ?? 0 },
      { name: "River", value: backendSignals.riverPressure ?? 0 },
      { name: "Wetness", value: backendSignals.wetnessPressure ?? 0 },
      { name: "Public", value: backendSignals.publicSignalPressure ?? 0 },
      { name: "Confidence", value: backendSignals.confidence ?? 0 },
    ];
  }

  const weather = signals.weatherObservations ?? {};
  const rainfallSeries = signals.rainfallSeries ?? {};
  const riverContext = signals.riverContext ?? {};

  const rainfallPoints = rainfallSeries.points ?? [];
  const riverStations = riverContext.stations ?? [];

  // ---------- Rainfall ----------
  // Use recent valid rainfall points and recent max rainfall
  const validRainfall = rainfallPoints
    .map((p) => p.rainfallMm)
    .filter((v) => typeof v === "number" && !Number.isNaN(v));

  const latestRainfall =
    rainfallSeries.latestValidRainfallMm ??
    (validRainfall.length > 0 ? validRainfall[validRainfall.length - 1] : 0);

  const maxRecentRainfall =
    validRainfall.length > 0 ? Math.max(...validRainfall) : 0;

  // Blend latest and recent max
  const rainfallScore = clamp(
    Math.round(latestRainfall * 4 + maxRecentRainfall * 3)
  );

  // ---------- Weather ----------
  // Use non-zero rain trace, cloudiness, low cloud base, visibility
  const rainTrace = Number(weather.rainfallTraceMm ?? 0);
  const cloudOktas = Number(weather.cloudOktas ?? 0);
  const cloudBaseM =
    weather.cloudBaseM !== null && weather.cloudBaseM !== undefined
      ? Number(weather.cloudBaseM)
      : null;
  const visibilityKm =
    weather.visibilityKm !== null && weather.visibilityKm !== undefined
      ? Number(weather.visibilityKm)
      : null;

  let weatherScore = 15;

  if (rainTrace > 0) weatherScore += 15;
  if (cloudOktas >= 6) weatherScore += 15;
  if (cloudBaseM !== null && cloudBaseM <= 300) weatherScore += 10;
  if (visibilityKm !== null && visibilityKm <= 15) weatherScore += 5;

  weatherScore = clamp(weatherScore);

  // ---------- River ---------
  // Rising tendency should contribute the most
  let riverScore = 20;

  const risingCount = riverStations.filter(
    (station) => station.tendency?.toLowerCase() === "rising"
  ).length;

  const steadyCount = riverStations.filter(
    (station) => station.tendency?.toLowerCase() === "steady"
  ).length;

  riverScore += risingCount * 25;
  riverScore += steadyCount * 8;

  riverScore = clamp(riverScore);

  // ---------- Coverage ----------
  // Measures how complete the prototype inputs are
  const integratedLayers = [
    !!weather.stationName,
    rainfallPoints.length > 0,
    riverStations.length > 0,
  ].filter(Boolean).length;
  
  const coverageScore = Math.round((integratedLayers / 3) * 100);

  return [
    { name: "Rainfall", value: rainfallScore },
    { name: "Weather", value: weatherScore },
    { name: "River", value: riverScore },
    { name: "Input Coverage", value: coverageScore },
  ];
}


/* Helper function to summarise the river data feed, extracting key information like the primary station, its current height and tendency, the highest station, and counts of rising/steady/falling tendencies across all stations. This summary can then be used in the dashboard and risk assessment logic.*/
function formatRiverHeight(value) {
  if (value === null || value === undefined) return null;
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return null;
  return Number(numericValue.toFixed(2)).toString();
}

function summariseRiverData(riverData) {
  const stations = riverData.stations || [];

  const primaryStation =
    stations.find((s) => s.stationName.includes("Parramatta River at Riverside Theatre")) ||
    stations.find((s) => s.stationName.includes("Parramatta River")) ||
    stations[0];

  const highestStation = stations.reduce((max, station) => {
    if (!max || station.heightM > max.heightM) return station;
    return max;
  }, null);

  const tendencyCounts = stations.reduce(
    (acc, station) => {
      const tendency = station.tendency?.toLowerCase();
      if (tendency === "rising") acc.rising += 1;
      else if (tendency === "falling") acc.falling += 1;
      else acc.steady += 1;
      return acc;
    },
    { rising: 0, steady: 0, falling: 0 }
  );

  return {
    issuedDate: riverData.issuedDate,
    stationCount: stations.length,
    primaryStationName: primaryStation?.stationName || "Unknown station",
    primaryHeight: formatRiverHeight(primaryStation?.heightM),
    primaryTendency: primaryStation?.tendency || "unknown",
    highestStationName: highestStation?.stationName || "Unknown station",
    highestHeight: formatRiverHeight(highestStation?.heightM),
    tendencyCounts,
  };
}

function buildRiskAssessment(parramattaSignals, riverSummary, publicSignalCards) {
  if (parramattaSignals.riskAssessment) {
    return {
      riskLevel: parramattaSignals.riskAssessment.concernLevel,
      score: parramattaSignals.riskAssessment.score,
      reasons: parramattaSignals.riskAssessment.reasons,
      summary: parramattaSignals.riskAssessment.summary,
    };
  }

  const latestRain = parramattaSignals.rainfallSeries.latestValidRainfallMm ?? 0;
  const risingStations = riverSummary.tendencyCounts.rising;
  const reportCount = publicSignalCards.length;

  let riskLevel = "Low";
  const reasons = [];

  if (latestRain >= 5) {
    riskLevel = "Moderate";
    reasons.push(`Recent rainfall signal recorded: ${latestRain} mm`);
  }

  if (risingStations > 0) {
    riskLevel = "Moderate";
    reasons.push(`${risingStations} monitored river/creek station(s) are rising`);
  }

  if (reportCount >= 2) {
    reasons.push(`${reportCount} public/local signals included in the current prototype`);
  }

  if (latestRain >= 10 && risingStations > 0) {
    riskLevel = "High";
    reasons.push("Rainfall and river signals indicate elevated local flood concern");
  }

  return {
    riskLevel,
    score: null,
    reasons,
    summary:
      riskLevel === "High"
        ? "FloodGuard has identified elevated local flood concern from combined rainfall, river, and public signal inputs."
        : riskLevel === "Moderate"
        ? "FloodGuard has identified moderate local flood concern using recent rainfall, public observations, and Parramatta river-context signals."
        : "FloodGuard currently indicates low immediate flood concern while continuing to monitor rainfall and river conditions.",
  };
}

function buildRainfallTrend(signals) {
  return (signals.rainfallSeries?.points ?? []).map((point, index, points) => {
    const timestamp = new Date(point.time);
    const previousPoint = index > 0 ? points[index - 1] : null;
    const change =
      previousPoint && typeof previousPoint.rainfallMm === "number"
        ? Number((point.rainfallMm - previousPoint.rainfallMm).toFixed(1))
        : null;

    return {
      time: timestamp.toLocaleDateString("en-AU", {
        day: "numeric",
        month: "short",
      }),
      shortTime: timestamp.toLocaleTimeString("en-AU", {
        hour: "numeric",
        minute: "2-digit",
      }),
      timestamp: timestamp.toLocaleString("en-AU", {
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      }),
      rainfall: point.rainfallMm,
      change,
    };
  });
}

function formatAreaSignalFit(areaRelevance) {
  if (!areaRelevance) return "Config mapped";

  const label =
    areaRelevance.status === "complete"
      ? "complete"
      : areaRelevance.status === "partial"
        ? "partial"
        : "limited";

  return `${areaRelevance.score}% ${label}`;
}

function formatSourceFreshness(freshness) {
  if (!freshness) return "Unknown";
  if (freshness.staleSourceCount > 0) {
    return `${freshness.staleSourceCount} stale source`;
  }
  if (freshness.fallbackSourceCount > 0) {
    return `${freshness.fallbackSourceCount} fallback source`;
  }
  return "Current";
}

function sourceReliabilityKind(source) {
  const mode = source.dataMode ?? source.mode;
  if (source.freshnessStatus === "not-connected" || source.freshnessStatus === "missing") {
    return "not-connected";
  }
  if (["local-fallback", "local_demo_fallback"].includes(mode)) return "fallback";
  if (source.type === "weather" && source.freshnessStatus === "stale") return "stale-context";
  if (
    ["rainfall", "river"].includes(source.type) &&
    source.sourceStrength === "primary_live_gauge" &&
    source.freshnessStatus === "current"
  ) {
    return "live-gauge";
  }
  if (source.freshnessStatus === "current") return "current-context";
  if (source.freshnessStatus === "stale") return "stale";
  return "unknown";
}

function sourceReliabilityLabel(source) {
  const kind = sourceReliabilityKind(source);
  if (kind === "live-gauge") return "Live gauge";
  if (kind === "current-context") return "Current context";
  if (kind === "stale-context") return "Stale context";
  if (kind === "fallback") return "Demo/Fallback";
  if (kind === "not-connected") return "Not connected";
  if (kind === "stale") return "Stale";
  return "Unknown";
}

function formatHealthLabel(status) {
  if (status === "live") return "Live";
  if (status === "partial") return "Partial";
  if (status === "pass") return "Live";
  if (status === "warn") return "Partial";
  if (status === "blocked") return "Blocked";
  if (status === "missing") return "Missing";
  if (status === "not_connected") return "Not connected";
  return "Unknown";
}

function buildReliabilitySummary(sources = [], ingestionHealth = null) {
  if (ingestionHealth?.overallStatus) {
    const labels = [
      `Core gauges: ${formatHealthLabel(ingestionHealth.coreFloodStatus)}`,
      `Context: ${formatHealthLabel(ingestionHealth.contextStatus)}`,
      `Warnings: ${formatHealthLabel(ingestionHealth.warningStatus)}`,
    ];

    return {
      label: formatHealthLabel(ingestionHealth.overallStatus),
      note: `${ingestionHealth.summary || "Signal source health has been checked."} ${labels.join(
        ". ",
      )}.`,
    };
  }

  const coreSources = sources.filter((source) => ["rainfall", "river"].includes(source.type));
  const contextSources = sources.filter((source) => !["rainfall", "river"].includes(source.type));
  const coreLive = coreSources.every(
    (source) =>
      source.sourceStrength === "primary_live_gauge" &&
      source.freshnessStatus === "current" &&
      source.mode !== "local-fallback",
  );
  const staleContext = contextSources.some((source) => source.freshnessStatus === "stale");
  const fallbackCore = coreSources.some((source) => source.mode === "local-fallback");

  if (!coreLive || fallbackCore) {
    return {
      label: "Blocked",
      note: "Core rainfall or river gauges are stale, fallback, missing, or mismatched.",
    };
  }

  if (staleContext) {
    return {
      label: "Partial",
      note: "Live gauge data is current. Some supporting sources are stale or not yet connected.",
    };
  }

  return {
    label: "Live",
    note: "Live rainfall and river gauges are current.",
  };
}

function formatRefreshStatus(refreshMetadata, sourceStatus) {
  if (sourceStatus !== "api") return "Local fallback signals loaded";
  if (refreshMetadata?.status === "protected-cache") return "Latest good API snapshot kept";
  if (refreshMetadata?.status === "blocked-refresh") return "Live API refresh blocked";
  if (refreshMetadata?.status === "cache") return "Live API cache loaded";
  if (refreshMetadata?.status === "refreshed") return "Live API ingestion synced";
  return "Live API ingestion synced";
}

function formatRefreshNote(refreshMetadata) {
  if (refreshMetadata?.status === "protected-cache") {
    return refreshMetadata.reason;
  }

  if (refreshMetadata?.status === "blocked-refresh") {
    return "Live refresh returned blocked core data; source diagnostics explain the failure.";
  }

  return null;
}

function formatSourceAge(ageHours) {
  if (ageHours === null || ageHours === undefined) return "age unknown";
  if (ageHours < 1) return "under 1h old";
  return `${Math.round(ageHours)}h old`;
}

function formatDistanceKm(value) {
  if (value === null || value === undefined) return "Unknown";
  return `${value} km`;
}

function formatObservedAt(value) {
  if (!value) return "No source timestamp";

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return "No source timestamp";

  return new Date(timestamp).toLocaleString("en-AU");
}

function formatFitStatus(status) {
  if (status === "complete") return "Complete";
  if (status === "partial") return "Partial";
  if (status === "limited") return "Limited";
  return "Unknown";
}

function formatSpatialStatus(status) {
  if (status === "local-fit") return "Local fit";
  if (status === "wide-fit") return "Wide fit";
  if (status === "no-station-coordinates") return "No coordinates";
  return "Unknown";
}

function buildLocationRelevance(signals) {
  const areaRelevance = signals.areaRelevance ?? {};
  const spatialRelevance = signals.spatialRelevance ?? {};
  const sourceFit = areaRelevance.sourceFit ?? {};
  const sourceRows = ["weather", "rainfall", "river"]
    .map((type) => sourceFit[type])
    .filter(Boolean);

  return {
    areaName: areaRelevance.areaName ?? signals.area?.name ?? signals.location?.name,
    catchment: areaRelevance.catchment ?? signals.area?.catchment,
    fitScore: areaRelevance.score,
    fitStatus: areaRelevance.status,
    matchedSignals: areaRelevance.matchedSignals,
    expectedSignals: areaRelevance.expectedSignals,
    sourceRows,
    matchedRiverStations: areaRelevance.matchedRiverStations ?? [],
    missingRiverStations: areaRelevance.missingRiverStations ?? [],
    spatialStatus: spatialRelevance.status ?? areaRelevance.spatial?.status,
    coverageRadiusKm:
      spatialRelevance.coverageRadiusKm ?? areaRelevance.spatial?.coverageRadiusKm,
    nearestStationDistanceKm:
      spatialRelevance.nearestStationDistanceKm ??
      areaRelevance.spatial?.nearestStationDistanceKm,
    nearestStations: spatialRelevance.nearestStations ?? [],
    notes: areaRelevance.notes ?? [],
  };
}

function buildDashboardData(signals, sourceStatus, liveStatus) {
  const areaName = signals.area?.name || signals.location.name;
  const riverSummary = summariseRiverData(signals.riverContext);
  const publicSignalCards = buildPublicSignalCards(signals);
  const riskAssessment = buildRiskAssessment(signals, riverSummary, publicSignalCards);
  const latestRain = signals.rainfallSeries.latestValidRainfallMm;
  const sourceHealth = signals.sourceMetadata ?? [];
  const ingestionHealth = signals.ingestionHealth ?? null;
  const reliabilitySummary = buildReliabilitySummary(sourceHealth, ingestionHealth);
  const refreshMetadata = signals.refreshMetadata ?? null;
  const publicSignalSummary = signals.publicSignalSummary ?? {
    recentReports: 0,
    actionableReports: 0,
    imageEvidenceReports: 0,
    imageReviewQueueCount: 0,
    urgentImageReviewCount: 0,
    elevatedImageReviewCount: 0,
    publicSignalPressure: 0,
    note: "No public signal summary is available.",
  };
  const rainDisplay = latestRain !== null ? `${latestRain} mm` : "No recent reading";
  const dataStatus = liveStatus.isRefreshing
    ? "Refreshing live area signals"
    : formatRefreshStatus(refreshMetadata, sourceStatus);
  const refreshNote = formatRefreshNote(refreshMetadata);

  return {
    areaName,
    location: signals.location.name,
    riskLevel: riskAssessment.riskLevel,
    summary: riskAssessment.summary,
    riverSummary,
    rainfallTrend: buildRainfallTrend(signals),
    riskSignals: buildRiskSignals(signals),
    sourceHealth,
    reliabilitySummary,
    ingestionHealth,
    refreshMetadata,
    locationRelevance: buildLocationRelevance(signals),
    decisionAudit: signals.riskAssessment?.decisionAudit ?? null,
    publicSignalSummary,

    officialSignals: {
      warningStatus: dataStatus,
      dataReliability: reliabilitySummary.label,
      dataReliabilityNote: [reliabilitySummary.note, refreshNote].filter(Boolean).join(" "),
      areaSignalFit: formatAreaSignalFit(signals.areaRelevance),
      sourceFreshness: formatSourceFreshness(signals.freshness),
      spatialRadius: formatDistanceKm(signals.spatialRelevance?.coverageRadiusKm),
      nearestStation: formatDistanceKm(signals.spatialRelevance?.nearestStationDistanceKm),
      rainfall24h: rainDisplay,
      waterTrend: `${riverSummary.primaryTendency} at ${riverSummary.primaryStationName}`,
      forecastOutlook:
        liveStatus.lastUpdated || signals.ingestedAt
          ? `Updated ${new Date(
              liveStatus.lastUpdated || signals.ingestedAt
            ).toLocaleString("en-AU")}`
          : `River feed issued ${riverSummary.issuedDate}`,
    },

    contributingFactors: [
      ...riskAssessment.reasons,
      ...(signals.areaRelevance?.notes ?? []),
      ...(signals.spatialRelevance?.notes ?? []),
      `Primary river station: ${riverSummary.primaryStationName} (${riverSummary.primaryHeight} m)`,
      `${riverSummary.stationCount} monitored river/creek stations included in current feed`,
    ],

    recommendedActions: [
      "Monitor flood-prone crossings, creek paths, and river-adjacent walkways",
      "Check official warnings and local updates before travelling",
      "Use caution if rainfall resumes or water levels begin rising nearby",
    ],

    reports: publicSignalCards,

    evidence: [
      {
        label: "Public Inputs Integrated",
        value: "3",
        note: "Weather observations, rainfall gauge series, and river-height context",
      },
      {
        label: "Risk Score",
        value:
          typeof riskAssessment.score === "number"
            ? `${riskAssessment.score}/100`
            : riskAssessment.riskLevel,
        note: "Rainfall, river, wetness, and confidence are combined into one explainable score",
      },
      {
        label: "Current River Feed",
        value: String(riverSummary.stationCount),
        note: `${riverSummary.tendencyCounts.steady} steady, ${riverSummary.tendencyCounts.falling} falling, ${riverSummary.tendencyCounts.rising} rising`,
      },
      {
        label: "Community Signals",
        value: String(publicSignalSummary.recentReports),
        note: `${publicSignalSummary.actionableReports} actionable, ${publicSignalSummary.imageEvidenceReports ?? 0} with image evidence`,
      },
    ],
  };
}

function topPriorityFactors(factors = []) {
  return factors.slice(0, 4);
}

function useParramattaSignals(selectedAreaId) {
  const [signals, setSignals] = useState(localParramattaSignals);
  const [sourceStatus, setSourceStatus] = useState("local");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  const loadAreaSignals = useCallback(
    async ({ forceRefresh = false, signal } = {}) => {
      setIsRefreshing(true);

      try {
        const apiSignals = await fetchParramattaSignals({
          areaId: selectedAreaId,
          refresh: forceRefresh,
          signal,
        });

        setSignals(apiSignals);
        setSourceStatus("api");
        setLastUpdated(apiSignals.ingestedAt || new Date().toISOString());
        setErrorMessage(null);
      } catch (error) {
        if (error.name !== "AbortError") {
          setSourceStatus("local");
          setErrorMessage(error.message);
        }
      } finally {
        setIsRefreshing(false);
      }
    },
    [selectedAreaId]
  );

  useEffect(() => {
    const controller = new AbortController();
    let intervalId;

    loadAreaSignals({ signal: controller.signal });
    intervalId = window.setInterval(() => {
      loadAreaSignals({ forceRefresh: true });
    }, liveRefreshIntervalMs);

    return () => {
      controller.abort();
      window.clearInterval(intervalId);
    };
  }, [loadAreaSignals]);

  return {
    signals,
    sourceStatus,
    liveStatus: {
      errorMessage,
      isRefreshing,
      lastUpdated,
      refresh: () => loadAreaSignals({ forceRefresh: true }),
    },
  };
}

function useFloodguardAreas() {
  const [areas, setAreas] = useState(fallbackAreas);

  useEffect(() => {
    const controller = new AbortController();

    fetchFloodguardAreas({ signal: controller.signal })
      .then(setAreas)
      .catch((error) => {
        if (error.name !== "AbortError") {
          setAreas(fallbackAreas);
        }
      });

    return () => controller.abort();
  }, []);

  return areas;
}

function useAreaHistory(selectedAreaId, lastUpdated) {
  const [history, setHistory] = useState([]);

  useEffect(() => {
    const controller = new AbortController();

    fetchAreaHistory({
      areaId: selectedAreaId,
      limit: 12,
      signal: controller.signal,
    })
      .then(setHistory)
      .catch((error) => {
        if (error.name !== "AbortError") {
          setHistory([]);
        }
      });

    return () => controller.abort();
  }, [selectedAreaId, lastUpdated]);

  return history;
}

function useCommunityReports(selectedAreaId, lastUpdated) {
  const [reports, setReports] = useState([]);
  const [status, setStatus] = useState("idle");
  const [errorMessage, setErrorMessage] = useState(null);

  useEffect(() => {
    const controller = new AbortController();

    fetchCommunityReports({
      areaId: selectedAreaId,
      limit: 6,
      signal: controller.signal,
    })
      .then((apiReports) => {
        setReports(apiReports);
        setStatus("ready");
        setErrorMessage(null);
      })
      .catch((error) => {
        if (error.name !== "AbortError") {
          setStatus("unavailable");
          setErrorMessage(error.message);
        }
      });

    return () => controller.abort();
  }, [selectedAreaId, lastUpdated]);

  const submitReport = useCallback(
    async (report) => {
      setStatus("submitting");

      try {
        const savedReport = await submitCommunityReport({
          ...report,
          areaId: selectedAreaId,
        });
        setReports((current) => [savedReport, ...current].slice(0, 6));
        setStatus("ready");
        setErrorMessage(null);
        return savedReport;
      } catch (error) {
        setStatus("unavailable");
        setErrorMessage(error.message);
        throw error;
      }
    },
    [selectedAreaId],
  );

  return {
    errorMessage,
    reports,
    status,
    submitReport,
  };
}

function useEvidenceReviewQueue(selectedAreaId, lastUpdated) {
  const [queue, setQueue] = useState({
    itemCount: 0,
    urgentCount: 0,
    elevatedCount: 0,
    routineCount: 0,
    privacyNote: "Evidence review API is unavailable.",
    items: [],
  });

  useEffect(() => {
    const controller = new AbortController();

    fetchEvidenceReviewQueue({
      areaId: selectedAreaId,
      limit: 8,
      signal: controller.signal,
    })
      .then(setQueue)
      .catch((error) => {
        if (error.name !== "AbortError") {
          setQueue({
            itemCount: 0,
            urgentCount: 0,
            elevatedCount: 0,
            routineCount: 0,
            privacyNote: "Evidence review API is unavailable.",
            items: [],
          });
        }
      });

    return () => controller.abort();
  }, [selectedAreaId, lastUpdated]);

  return queue;
}

function useAreaFeatures(selectedAreaId, lastUpdated) {
  const [featureDataset, setFeatureDataset] = useState({
    rows: [],
    summary: {
      rowCount: 0,
      elevatedCount: 0,
      readyForTraining: false,
      readinessNote: "Waiting for feature rows.",
    },
  });

  useEffect(() => {
    const controller = new AbortController();

    fetchAreaFeatures({
      areaId: selectedAreaId,
      limit: 100,
      signal: controller.signal,
    })
      .then(setFeatureDataset)
      .catch((error) => {
        if (error.name !== "AbortError") {
          setFeatureDataset({
            rows: [],
            summary: {
              rowCount: 0,
              elevatedCount: 0,
              readyForTraining: false,
              readinessNote: "Feature API is unavailable.",
            },
          });
        }
      });

    return () => controller.abort();
  }, [selectedAreaId, lastUpdated]);

  return featureDataset;
}

function useDatasetQuality(selectedAreaId, lastUpdated) {
  const [quality, setQuality] = useState({
    rowCount: 0,
    elevatedCount: 0,
    lowCount: 0,
    readyForModelComparison: false,
    classBalanceStatus: "unknown",
    averageReliabilityScore: null,
    gates: [],
    warnings: ["Dataset quality API is unavailable."],
  });

  useEffect(() => {
    const controller = new AbortController();

    fetchDatasetQuality({
      areaId: selectedAreaId,
      limit: 100,
      signal: controller.signal,
    })
      .then(setQuality)
      .catch((error) => {
        if (error.name !== "AbortError") {
          setQuality({
            rowCount: 0,
            elevatedCount: 0,
            lowCount: 0,
            readyForModelComparison: false,
            classBalanceStatus: "unknown",
            averageReliabilityScore: null,
            gates: [],
            warnings: ["Dataset quality API is unavailable."],
          });
        }
      });

    return () => controller.abort();
  }, [selectedAreaId, lastUpdated]);

  return quality;
}

function useBaselinePrediction(selectedAreaId, lastUpdated) {
  const [baselinePrediction, setBaselinePrediction] = useState({
    modelName: "transparent feature baseline",
    status: "unavailable",
    prediction: null,
    evaluation: {
      sampleSize: 0,
      accuracy: null,
      truePositive: 0,
      trueNegative: 0,
      falsePositive: 0,
      falseNegative: 0,
    },
    readiness: {
      readyForExperiment: false,
      rowCount: 0,
      elevatedExamples: 0,
      note: "Baseline API is unavailable.",
    },
  });

  useEffect(() => {
    const controller = new AbortController();

    fetchBaselinePrediction({
      areaId: selectedAreaId,
      limit: 100,
      signal: controller.signal,
    })
      .then(setBaselinePrediction)
      .catch((error) => {
        if (error.name !== "AbortError") {
          setBaselinePrediction((current) => ({
            ...current,
            status: "unavailable",
            readiness: {
              ...current.readiness,
              note: "Baseline API is unavailable.",
            },
          }));
        }
      });

    return () => controller.abort();
  }, [selectedAreaId, lastUpdated]);

  return baselinePrediction;
}

function useModelExperiment(selectedAreaId, lastUpdated) {
  const [modelExperiment, setModelExperiment] = useState({
    modelFamily: "tabular flood-signal baseline",
    status: "unavailable",
    rowCount: 0,
    classBalance: {
      elevatedCount: 0,
      lowCount: 0,
      status: "unknown",
    },
    readiness: {
      readyForComparison: false,
      note: "Model experiment API is unavailable.",
    },
    candidates: [],
    safeguards: ["Model experiment API is unavailable."],
  });

  useEffect(() => {
    const controller = new AbortController();

    fetchModelExperiment({
      areaId: selectedAreaId,
      limit: 100,
      signal: controller.signal,
    })
      .then(setModelExperiment)
      .catch((error) => {
        if (error.name !== "AbortError") {
          setModelExperiment((current) => ({
            ...current,
            status: "unavailable",
            readiness: {
              ...current.readiness,
              note: "Model experiment API is unavailable.",
            },
          }));
        }
      });

    return () => controller.abort();
  }, [selectedAreaId, lastUpdated]);

  return modelExperiment;
}

function useModelCard(selectedAreaId, lastUpdated) {
  const [modelCard, setModelCard] = useState({
    modelName: "transparent feature baseline",
    modelType: "rule-weighted tabular baseline",
    status: "unavailable",
    target: "Waiting for model card.",
    scoreFormula: "Waiting for model card.",
    readiness: {
      readyForExperiment: false,
      rowCount: 0,
      elevatedExamples: 0,
      note: "Model card API is unavailable.",
    },
    limitations: ["Model card API is unavailable."],
    nextModelCandidates: [],
  });

  useEffect(() => {
    const controller = new AbortController();

    fetchModelCard({
      areaId: selectedAreaId,
      limit: 100,
      signal: controller.signal,
    })
      .then(setModelCard)
      .catch((error) => {
        if (error.name !== "AbortError") {
          setModelCard((current) => ({
            ...current,
            status: "unavailable",
            readiness: {
              ...current.readiness,
              note: "Model card API is unavailable.",
            },
          }));
        }
      });

    return () => controller.abort();
  }, [selectedAreaId, lastUpdated]);

  return modelCard;
}

function buildHistorySummary(history = []) {
  const latest = history[0] ?? null;
  const previous = history[1] ?? null;
  const scoreDelta =
    latest && previous && typeof latest.riskScore === "number" && typeof previous.riskScore === "number"
      ? latest.riskScore - previous.riskScore
      : null;

  return {
    latest,
    scoreDelta,
    snapshotCount: history.length,
  };
}

function sourceModeLabel(mode) {
  if (mode === "derived_proxy" || mode === "remote-derived") return "Derived proxy";
  if (mode === "remote") return "Live";
  if (mode === "live") return "Live";
  if (mode === "live_summary_fallback") return "Summary fallback";
  if (mode === "cached_recent") return "Recent cache";
  if (mode === "cached_stale") return "Stale cache";
  if (mode === "local-fallback" || mode === "local_demo_fallback") return "Demo fallback";
  if (mode === "not-configured") return "Not configured";
  if (mode === "missing") return "Missing";
  if (mode === "planned") return "Planned";
  return mode || "Unknown";
}

function reliabilityLabel(audit) {
  if (!audit) return "Waiting";
  return `${audit.reliability.level} (${audit.reliability.score}/100)`;
}

// #signal visualisation rainfall chart
function RainfallChart({ rainfallTrend }) {
  const peakRainfall = rainfallTrend.reduce(
    (maxValue, point) => Math.max(maxValue, Number(point.rainfall ?? 0)),
    0
  );

  return (
    <section className="card signal-chart-card">
      <div className="section-header compact">
        <div>
          <p className="section-label">Signal visualisation</p>
          <h3>Recent rainfall trend</h3>
        </div>
      </div>
      <div className="chart-box">
        <ResponsiveContainer width="100%" height={255}>
          <BarChart
            data={rainfallTrend}
            barCategoryGap="22%"
            margin={{ top: 8, right: 10, left: -16, bottom: 0 }}
          >
            <defs>
              <linearGradient id="rainfallFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2d8cf0" stopOpacity={0.95} />
                <stop offset="100%" stopColor="#8ec5ff" stopOpacity={0.55} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#dbe7f5" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="time"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={22}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              width={36}
              tickFormatter={(value) => `${value} mm`}
            />
            <Tooltip
              cursor={{ fill: "rgba(45, 140, 240, 0.08)" }}
              formatter={(value) => [`${value} mm`, "Rainfall"]}
              labelFormatter={(_, payload) =>
                payload?.[0]?.payload?.timestamp ?? "Rainfall reading"
              }
            />
            <ReferenceLine y={0} stroke="#b8cde5" />
            <Bar dataKey="rainfall" radius={[8, 8, 2, 2]} maxBarSize={28}>
              {rainfallTrend.map((point, index) => (
                <Cell
                  key={`${point.timestamp}-${index}`}
                  fill={point.rainfall === peakRainfall && peakRainfall > 0 ? "#0f6dcb" : "url(#rainfallFill)"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="chart-note">
        Bars show each observed rainfall reading in millimetres, with the darkest bar marking the local peak.
      </p>
    </section>
  );
}

// #decision evidence risk chart
function SignalBreakdownChart({ riskSignals }) {
  return (
    <section className="card signal-chart-card">
      <div className="section-header compact">
        <div>
          <p className="section-label">Decision evidence</p>
          <h3>Risk signal breakdown</h3>
        </div>
      </div>
      <div className="chart-box">
        <ResponsiveContainer width="100%" height={255}>
          <BarChart data={riskSignals}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="value" fill="#3c8de3" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

// #decision audit card
function DecisionAuditPanel({ audit }) {
  if (!audit) {
    return (
      <section className="card">
        <div className="section-header compact">
          <div>
            <p className="section-label">Decision audit</p>
            <h3>Reliability trace</h3>
          </div>
        </div>
        <p className="audit-note">Waiting for API decision audit.</p>
      </section>
    );
  }

  const auditWarnings = [...audit.reliability.blockers, ...audit.reliability.warnings];

  return (
    <section className="card">
      <div className="section-header compact">
        <div>
          <p className="section-label">Decision audit</p>
          <h3>Reliability trace</h3>
        </div>
        <span className={`source-badge ${audit.reliability.level.toLowerCase()}`}>
          {reliabilityLabel(audit)}
        </span>
      </div>

      <div className="audit-score-row">
        <div>
          <p className="section-label">Risk score</p>
          <h3>{audit.score}/100</h3>
        </div>
        <p className="audit-note">{audit.scoreFormula}</p>
      </div>

      <div className="audit-component-list">
        {audit.components.map((component) => (
          <div className="audit-component" key={component.label}>
            <div className="audit-component-top">
              <span>{component.label}</span>
              <strong>{component.contribution}</strong>
            </div>
            <div className="audit-bar">
              <span style={{ width: `${Math.min(component.value, 100)}%` }}></span>
            </div>
          </div>
        ))}
      </div>

      <ul className="factor-list history-list audit-warning-list">
        {auditWarnings.length > 0 ? (
          auditWarnings.map((warning) => <li key={warning}>{warning}</li>)
        ) : (
          <li>Decision inputs are complete and current enough for the current prototype.</li>
        )}
      </ul>
    </section>
  );
}

// #hero / project header
function Header() {
  return (
    <header className="hero">
      <div>
        <p className="eyebrow">Coding Fest 2026 Project Proposal</p>
        <h1>FloodGuard</h1>
        <p className="subtitle">
          A local flood risk awareness and community reporting platform
        </p>
      </div>
      <div className="hero-badge">
        <span>Decision Support Prototype</span>
      </div>
    </header>
  );
}

// #regional pilot selector
function AreaSelector({ areas, selectedAreaId, liveStatus, onAreaChange }) {
  const selectedArea = areas.find((area) => area.id === selectedAreaId);

  return (
    <section className="area-selector card">
      <div>
        <p className="section-label">Regional pilot area</p>
        <h3>{selectedArea?.catchment || "Parramatta River"}</h3>
        <p className="live-status">
          {liveStatus.errorMessage
            ? "Using local fallback while the live API reconnects"
            : liveStatus.lastUpdated
            ? `Live data updated ${new Date(liveStatus.lastUpdated).toLocaleTimeString("en-AU")}`
            : "Waiting for live area data"}
        </p>
      </div>

      <div className="area-controls">
        <div className="area-tabs" role="tablist" aria-label="Regional pilot areas">
          {areas.map((area) => (
            <button
              aria-selected={selectedAreaId === area.id}
              className={selectedAreaId === area.id ? "active" : ""}
              key={area.id}
              onClick={() => onAreaChange(area.id)}
              type="button"
            >
              {area.name.replace(", NSW", "")}
            </button>
          ))}
        </div>
        <button
          className="refresh-button"
          disabled={liveStatus.isRefreshing}
          onClick={liveStatus.refresh}
          type="button"
        >
          {liveStatus.isRefreshing ? "Refreshing" : "Refresh now"}
        </button>
      </div>
    </section>
  );
}

// #app section navigation
function AppNavigation({ activeView, onViewChange }) {
  return (
    <nav className="app-nav" aria-label="FloodGuard sections">
      {appSections.map((section) => (
        <button
          aria-current={activeView === section.id ? "page" : undefined}
          className={activeView === section.id ? "active" : ""}
          key={section.id}
          onClick={() => onViewChange(section.id)}
          type="button"
        >
          {section.label}
        </button>
      ))}
    </nav>
  );
}

// #area data loading guard
function AreaDataGuard({ areaName, liveStatus }) {
  return (
    <section className="overview-panel card area-data-guard">
      <div className="section-header">
        <div>
          <p className="section-label">Area signals</p>
          <h2>{areaName}</h2>
        </div>
      </div>
      <p className="overview-summary">
        {liveStatus.errorMessage
          ? `Could not load current signals for this area: ${liveStatus.errorMessage}`
          : `Loading current rainfall, river, weather, and warning signals for ${areaName}.`}
      </p>
    </section>
  );
}

// #monitored region overview
function OverviewPanel({ data }) {
  return (
    <section className="overview-panel card">
      <div className="section-header">
        <div>
          <p className="section-label">Monitored region</p>
          <h2>{data.location}</h2>
        </div>
        <span className={`risk-pill ${data.riskLevel.toLowerCase()}`}>
          {data.riskLevel} Risk
        </span>
      </div>

      <p className="overview-summary">{data.summary}</p>

      <div className="overview-grid">
        <InfoTile
          label="Data Reliability"
          value={data.officialSignals.dataReliability}
        />
        <InfoTile
          label="Area Signal Fit"
          value={data.officialSignals.areaSignalFit}
        />
        <InfoTile
          label="Source Freshness"
          value={data.officialSignals.sourceFreshness}
        />
        <InfoTile
          label="Spatial Radius"
          value={data.officialSignals.spatialRadius}
        />
        <InfoTile
          label="Nearest Station"
          value={data.officialSignals.nearestStation}
        />
        <InfoTile
          label="Rainfall (24h)"
          value={data.officialSignals.rainfall24h}
        />
        <InfoTile
          label="Water Trend"
          value={data.officialSignals.waterTrend}
        />
        <InfoTile
          label="Latest Feed Update"
          value={data.officialSignals.forecastOutlook}
        />
      </div>
      <p className="reliability-note">{data.officialSignals.dataReliabilityNote}</p>
    </section>
  );
}

// #front-page summary for screenshot and field use
function FrontPageSummary({ data }) {
  return (
    <section className="frontpage-grid">
      <div className="frontpage-actions">
        <ActionsPanel actions={data.recommendedActions} />
      </div>

      <div className="frontpage-river">
        <RiverStatusPanel
          areaName={data.areaName}
          riverSummary={data.riverSummary}
        />
      </div>

      <div className="frontpage-rainfall">
        <RainfallChart rainfallTrend={data.rainfallTrend} />
      </div>

      <div className="frontpage-factors">
        <FactorsPanel factors={topPriorityFactors(data.contributingFactors)} />
      </div>

      <div className="frontpage-map">
        <MapPanel areaName={data.areaName} />
      </div>
    </section>
  );
}

// #shared metric tile
function InfoTile({ label, value }) {
  return (
    <div className="info-tile">
      <p className="section-label">{label}</p>
      <h3>{value}</h3>
    </div>
  );
}

// #contributing factors card
function FactorsPanel({ factors }) {
  return (
    <section className="card">
      <div className="section-header compact">
        <div>
          <p className="section-label">Why this alert was assigned</p>
          <h3>Contributing factors</h3>
        </div>
      </div>
      <ul className="factor-list">
        {factors.map((factor, index) => (
          <li key={index}>{factor}</li>
        ))}
      </ul>
    </section>
  );
}

// #recommended actions card
function ActionsPanel({ actions }) {
  return (
    <section className="card">
      <div className="section-header compact">
        <div>
          <p className="section-label">What residents can do</p>
          <h3>Recommended actions</h3>
        </div>
      </div>
      <ul className="action-list">
        {actions.map((action, index) => (
          <li key={index}>{action}</li>
        ))}
      </ul>
    </section>
  );
}

// #source health diagnostics card
function SourceHealthPanel({ sources, ingestionHealth }) {
  const sourceRows =
    sources.length > 0
      ? sources
      : [
          {
            label: "Local fallback signals",
            type: "static",
            mode: "local",
            freshnessStatus: "unknown",
            observedAt: null,
            ageHours: null,
          },
        ];
  const hasWarningSource = sourceRows.some((source) => source.type === "warnings");
  const rows = hasWarningSource
    ? sourceRows
    : [
        ...sourceRows,
        {
          label: "NSW SES / HazardWatch warnings",
          type: "warnings",
          mode: "planned",
          freshnessStatus: "not-connected",
          observedAt: null,
          ageHours: null,
          sourceStrength: "official_warning",
          note: "Official warning integration is planned but not connected yet.",
        },
      ];

  return (
    <section className="card">
      <div className="section-header compact">
        <div>
          <p className="section-label">Source diagnostics</p>
          <h3>Data sources</h3>
        </div>
        {ingestionHealth?.overallStatus ? (
          <span className={`source-badge ${ingestionHealth.overallStatus}`}>
            {formatHealthLabel(ingestionHealth.overallStatus)}
          </span>
        ) : null}
      </div>

      {ingestionHealth?.summary ? (
        <p className="source-health-summary">{ingestionHealth.summary}</p>
      ) : null}

      <div className="source-health-list">
        {rows.map((source) => (
          <div className="source-health-item" key={`${source.type}-${source.label}`}>
            <div className="source-health-top">
              <div>
                <h4>{source.label}</h4>
                <p>{sourceModeLabel(source.mode)} {source.type}</p>
              </div>
              <span className={`source-badge ${sourceReliabilityKind(source)}`}>
                {sourceReliabilityLabel(source)}
              </span>
            </div>
            <p className="source-health-meta">
              {source.note || `${formatObservedAt(source.observedAt)} - ${formatSourceAge(source.ageHours)}`}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

// #location-aware relevance card
function LocationRelevancePanel({ relevance }) {
  const matchLabel =
    typeof relevance.matchedSignals === "number" && typeof relevance.expectedSignals === "number"
      ? `${relevance.matchedSignals}/${relevance.expectedSignals}`
      : "Unknown";
  const nearestStations = relevance.nearestStations.slice(0, 4);

  return (
    <section className="card location-relevance-card">
      <div className="section-header compact">
        <div>
          <p className="section-label">Location-aware data fit</p>
          <h3>Area relevance</h3>
        </div>
        <span className={`source-badge ${relevance.fitStatus ?? "unknown"}`}>
          {formatFitStatus(relevance.fitStatus)}
        </span>
      </div>

      <div className="relevance-summary-grid">
        <InfoTile
          label="Station match"
          value={matchLabel}
        />
        <InfoTile
          label="Fit score"
          value={
            typeof relevance.fitScore === "number"
              ? `${relevance.fitScore}%`
              : "Unknown"
          }
        />
        <InfoTile
          label="Spatial fit"
          value={formatSpatialStatus(relevance.spatialStatus)}
        />
        <InfoTile
          label="Coverage radius"
          value={formatDistanceKm(relevance.coverageRadiusKm)}
        />
      </div>

      <div className="relevance-source-list">
        {relevance.sourceRows.map((row) => (
          <div className="relevance-source-row" key={row.label}>
            <div>
              <h4>{row.label}</h4>
              <p>{row.matched}/{row.expected} configured signal(s) matched</p>
            </div>
            <strong>{row.score}%</strong>
          </div>
        ))}
      </div>

      {nearestStations.length > 0 && (
        <div className="nearest-station-list">
          <p className="section-label">Nearest configured context</p>
          {nearestStations.map((station) => (
            <span key={station.id}>
              {station.name} · {formatDistanceKm(station.distanceKm)}
            </span>
          ))}
        </div>
      )}

      {relevance.missingRiverStations.length > 0 ? (
        <ul className="factor-list history-list relevance-note-list">
          {relevance.missingRiverStations.map((station) => (
            <li key={station}>{station} is configured but missing from the current river feed.</li>
          ))}
        </ul>
      ) : (
        <p className="report-form-message">
          All configured river/creek stations for this area are present in the current feed.
        </p>
      )}
    </section>
  );
}

// #local situational awareness card
function ReportsPanel({ reports }) {
  return (
    <section className="card local-signals-card">
      <div className="section-header compact">
        <div>
          <p className="section-label">Local situational awareness</p>
          <h3>Recent public signals</h3>
        </div>
      </div>

      <div className="reports-list">
        {reports.map((report) => (
          <div className="report-card" key={report.id}>
            <div className="report-top">
              <div>
                <h4>{report.title}</h4>
                <p className="report-time">{report.time}</p>
              </div>
              <span className={`severity ${report.severity.toLowerCase()}`}>
                {report.severity}
              </span>
            </div>
            <p className="report-description">{report.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// #community report intake card
function CommunityReportPanel({ publicSignalSummary, reportState }) {
  const [form, setForm] = useState({
    description: "",
    imageCaption: "",
    imageUrl: "",
    severity: "low",
    signalType: "local observation",
  });
  const [submitMessage, setSubmitMessage] = useState(null);
  const isSubmitting = reportState.status === "submitting";

  const updateForm = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitMessage(null);

    try {
      await reportState.submitReport(form);
      setForm({
        description: "",
        imageCaption: "",
        imageUrl: "",
        severity: "low",
        signalType: "local observation",
      });
      setSubmitMessage("Report saved for the selected area.");
    } catch (error) {
      setSubmitMessage(error.message);
    }
  };

  return (
    <section className="card community-intake-card">
      <div className="section-header compact">
        <div>
          <p className="section-label">Community input</p>
          <h3>Resident reports</h3>
        </div>
      </div>

      <form className="report-form" onSubmit={handleSubmit}>
        <div className="community-summary">
          <div>
            <p className="section-label">Recent reports</p>
            <h4>{publicSignalSummary.recentReports ?? 0}</h4>
          </div>
          <div>
            <p className="section-label">Actionable</p>
            <h4>{publicSignalSummary.actionableReports ?? 0}</h4>
          </div>
          <div>
            <p className="section-label">Public pressure</p>
            <h4>{publicSignalSummary.publicSignalPressure ?? 0}/100</h4>
          </div>
          <div>
            <p className="section-label">Image evidence</p>
            <h4>{publicSignalSummary.imageEvidenceReports ?? 0}</h4>
          </div>
        </div>

        <div className="report-form-grid">
          <label>
            <span>Signal</span>
            <select name="signalType" onChange={updateForm} value={form.signalType}>
              <option value="local observation">Local observation</option>
              <option value="road pooling">Road pooling</option>
              <option value="creek level">Creek level</option>
              <option value="blocked drain">Blocked drain</option>
              <option value="walkway flooding">Walkway flooding</option>
            </select>
          </label>
          <label>
            <span>Severity</span>
            <select name="severity" onChange={updateForm} value={form.severity}>
              <option value="low">Low</option>
              <option value="moderate">Moderate</option>
              <option value="high">High</option>
            </select>
          </label>
        </div>
        <label>
          <span>Observation</span>
          <textarea
            name="description"
            onChange={updateForm}
            placeholder="Water over footpath near the creek"
            required
            rows={3}
            value={form.description}
          />
        </label>
        <div className="report-form-grid">
          <label>
            <span>Image evidence URL</span>
            <input
              name="imageUrl"
              onChange={updateForm}
              placeholder="https://example.com/flood-photo.jpg"
              type="url"
              value={form.imageUrl}
            />
          </label>
          <label>
            <span>Image note</span>
            <input
              maxLength={120}
              name="imageCaption"
              onChange={updateForm}
              placeholder="Photo facing the creek crossing"
              type="text"
              value={form.imageCaption}
            />
          </label>
        </div>
        <button className="refresh-button report-submit" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Saving" : "Save report"}
        </button>
        {submitMessage && <p className="report-form-message">{submitMessage}</p>}
        {reportState.errorMessage && (
          <p className="report-form-message">{reportState.errorMessage}</p>
        )}
      </form>

      <div className="community-report-list">
        {reportState.reports.length > 0 ? (
          reportState.reports.map((report) => (
            <div className="community-report-item" key={report.id}>
              <div className="report-top">
                <div>
                  <h4>{report.title}</h4>
                  <p className="report-time">
                    {new Date(report.createdAt).toLocaleString("en-AU")}
                  </p>
                </div>
                <span className={`severity ${report.severity}`}>{report.severity}</span>
              </div>
              <p className="report-description">{report.description}</p>
              {report.imageEvidence && (
                <p className="report-evidence">
                  Image evidence linked -{" "}
                  {report.validation?.imageValidation?.severityHint?.class ??
                    report.imageEvidence.verification}
                </p>
              )}
              <p className="report-quality">
                Quality {report.validation?.qualityScore ?? report.confidence}/100 - {report.status}
              </p>
            </div>
          ))
        ) : (
          <p className="report-description">No stored resident reports for this area yet.</p>
        )}
      </div>
    </section>
  );
}

// #image evidence review card
function EvidenceReviewPanel({ queue }) {
  return (
    <section className="card evidence-review-card">
      <div className="section-header compact">
        <div>
          <p className="section-label">Image-assisted validation</p>
          <h3>Evidence review queue</h3>
        </div>
      </div>

      <div className="history-grid">
        <InfoTile label="Needs review" value={String(queue.itemCount)} />
        <InfoTile label="Elevated/urgent" value={String(queue.urgentCount + queue.elevatedCount)} />
      </div>

      <div className="evidence-review-list">
        {queue.items.length > 0 ? (
          queue.items.map((item) => (
            <div className="evidence-review-item" key={item.id}>
              <div className="report-top">
                <div>
                  <h4>{item.title}</h4>
                  <p className="report-time">
                    {item.imageHost} - {item.imageType}
                  </p>
                </div>
                <span className={`review-priority ${item.priority.level}`}>
                  {item.priority.score}/100
                </span>
              </div>
              <p className="report-description">{item.caption}</p>
              {item.imageValidation?.severityHint && (
                <p className="report-evidence">
                  Visual hint: {item.imageValidation.severityHint.class} -{" "}
                  {item.imageValidation.severityHint.rationale}
                </p>
              )}
              <p className="report-evidence">{item.reasons.join("; ")}</p>
            </div>
          ))
        ) : (
          <p className="report-description">No linked image evidence is waiting for review.</p>
        )}
      </div>

      <p className="report-form-message">{queue.privacyNote}</p>
    </section>
  );
}

// #prototype evidence card
function EvidencePanel({ evidence }) {
  return (
    <section className="card">
      <div className="section-header compact">
        <div>
          <p className="section-label">Prototype evidence</p>
          <h3>How FloodGuard creates value</h3>
        </div>
      </div>

      <div className="evidence-grid">
        {evidence.map((item, index) => (
          <div className="evidence-card" key={index}>
            <p className="section-label">{item.label}</p>
            <h3>{item.value}</h3>
            <p className="evidence-note">{item.note}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// #historical storage card
function HistoryPanel({ history }) {
  const summary = buildHistorySummary(history);
  const latest = summary.latest;
  const scoreDeltaLabel =
    summary.scoreDelta === null
      ? "No previous score yet"
      : `${summary.scoreDelta >= 0 ? "+" : ""}${summary.scoreDelta} since previous snapshot`;

  return (
    <section className="card">
      <div className="section-header compact">
        <div>
          <p className="section-label">Historical storage</p>
          <h3>Signal memory</h3>
        </div>
      </div>

      <div className="history-grid">
        <InfoTile label="Stored snapshots" value={String(summary.snapshotCount)} />
        <InfoTile
          label="Latest risk score"
          value={latest ? `${latest.riskScore}/100` : "No history yet"}
        />
      </div>

      <ul className="factor-list history-list">
        <li>{scoreDeltaLabel}</li>
        <li>
          Latest rainfall: {latest?.rainfall.latestValidRainfallMm ?? "unknown"} mm from{" "}
          {latest?.rainfall.sourceLabel ?? "no stored source"}
        </li>
        <li>
          River memory: {latest?.river.stationCount ?? 0} station(s), primary tendency{" "}
          {latest?.river.primaryTendency ?? "unknown"}
        </li>
      </ul>
    </section>
  );
}

// #ML readiness card
function FeatureReadinessPanel({ dataset }) {
  const summary = dataset.summary;
  const latest = summary.latest;

  return (
    <section className="card">
      <div className="section-header compact">
        <div>
          <p className="section-label">ML readiness</p>
          <h3>Feature table</h3>
        </div>
      </div>

      <div className="history-grid">
        <InfoTile label="Feature rows" value={String(summary.rowCount)} />
        <InfoTile label="Elevated examples" value={String(summary.elevatedCount)} />
      </div>

      <ul className="factor-list history-list">
        <li>{summary.readinessNote}</li>
        <li>
          Latest row: score {latest?.riskScore ?? "unknown"}, confidence{" "}
          {latest?.confidence ?? "unknown"}%
        </li>
        <li>
          Model target: classify whether local concern is elevated from rainfall, river,
          wetness, and source confidence features
        </li>
      </ul>
    </section>
  );
}

// #dataset quality card
function DatasetQualityPanel({ quality }) {
  const readyLabel = quality.readyForModelComparison ? "Ready" : "Collecting";
  const reliabilityLabel =
    quality.averageReliabilityScore === null ? "Unknown" : `${quality.averageReliabilityScore}/100`;

  return (
    <section className="card">
      <div className="section-header compact">
        <div>
          <p className="section-label">Training data quality</p>
          <h3>Dataset readiness</h3>
        </div>
      </div>

      <div className="history-grid">
        <InfoTile label="Model readiness" value={readyLabel} />
        <InfoTile label="Avg reliability" value={reliabilityLabel} />
      </div>

      <ul className="factor-list history-list">
        {quality.gates.slice(0, 4).map((gate) => (
          <li key={gate.name}>
            {gate.name}: {gate.actual}/{gate.required} {gate.status}
          </li>
        ))}
        {(quality.warnings ?? []).slice(0, 2).map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
    </section>
  );
}

// #baseline prediction card
function BaselinePredictionPanel({ baseline }) {
  const prediction = baseline.prediction;
  const accuracy =
    baseline.evaluation.accuracy === null
      ? baseline.evaluation.accuracyStatus === "single-class-history"
        ? "Needs elevated examples"
        : "Not enough history"
      : `${baseline.evaluation.accuracy}%`;
  const agreement = prediction
    ? prediction.agreesWithRuleEngine
      ? "Agrees with rule engine"
      : "Differs from rule engine"
    : "Waiting for prediction";

  return (
    <section className="card">
      <div className="section-header compact">
        <div>
          <p className="section-label">Baseline modelling</p>
          <h3>Transparent predictor</h3>
        </div>
      </div>

      <div className="history-grid">
        <InfoTile
          label="Prediction"
          value={prediction ? prediction.label : "Waiting"}
        />
        <InfoTile
          label="Baseline Score"
          value={prediction ? `${prediction.score}/100` : "No score"}
        />
      </div>

      <ul className="factor-list history-list">
        <li>{agreement}</li>
        <li>Holdout accuracy: {accuracy} across {baseline.evaluation.sampleSize} previous row(s)</li>
        <li>{baseline.readiness.note}</li>
      </ul>
    </section>
  );
}

// #model experiment comparison card
function ModelExperimentPanel({ experiment }) {
  const logisticCandidate =
    experiment.candidates?.find((candidate) => candidate.name.includes("logistic")) ?? null;
  const ruleCandidate =
    experiment.candidates?.find((candidate) => candidate.name.includes("rule")) ?? null;
  const logisticAccuracy =
    logisticCandidate?.evaluation?.accuracy === null || logisticCandidate?.evaluation?.accuracy === undefined
      ? logisticCandidate?.evaluation?.accuracyStatus ?? "collecting"
      : `${logisticCandidate.evaluation.accuracy}%`;
  const ruleScore =
    ruleCandidate?.latestScore === null || ruleCandidate?.latestScore === undefined
      ? "Waiting"
      : `${ruleCandidate.latestScore}/100`;
  const logisticScore =
    logisticCandidate?.latestScore === null || logisticCandidate?.latestScore === undefined
      ? "Waiting"
      : `${logisticCandidate.latestScore}/100`;

  return (
    <section className="card model-experiment-card">
      <div className="section-header compact">
        <div>
          <p className="section-label">Predictive modelling</p>
          <h3>Model experiment</h3>
        </div>
      </div>

      <div className="history-grid">
        <InfoTile label="Rows" value={String(experiment.rowCount ?? 0)} />
        <InfoTile
          label="Class balance"
          value={`${experiment.classBalance?.lowCount ?? 0} low / ${
            experiment.classBalance?.elevatedCount ?? 0
          } elevated`}
        />
        <InfoTile label="Rule score" value={ruleScore} />
        <InfoTile label="Logistic score" value={logisticScore} />
      </div>

      <ul className="factor-list history-list">
        <li>{experiment.readiness?.note}</li>
        <li>Logistic holdout: {logisticAccuracy}</li>
        {(logisticCandidate?.topDrivers ?? []).slice(0, 3).map((driver) => (
          <li key={driver.field}>
            {driver.label}: {driver.value} ({driver.contribution >= 0 ? "+" : ""}
            {driver.contribution})
          </li>
        ))}
        {(experiment.safeguards ?? []).slice(0, 1).map((safeguard) => (
          <li key={safeguard}>{safeguard}</li>
        ))}
      </ul>
    </section>
  );
}

// #model card panel
function ModelCardPanel({ modelCard }) {
  return (
    <section className="card">
      <div className="section-header compact">
        <div>
          <p className="section-label">Model governance</p>
          <h3>Baseline model card</h3>
        </div>
      </div>

      <div className="history-grid">
        <InfoTile label="Model type" value={modelCard.modelType} />
        <InfoTile label="Status" value={modelCard.status} />
      </div>

      <ul className="factor-list history-list">
        <li>{modelCard.target}</li>
        <li>{modelCard.readiness.note}</li>
        <li>{modelCard.limitations?.[0] ?? "Limitations are waiting for the API."}</li>
      </ul>
    </section>
  );
}

// #system flow card
function ArchitecturePanel() {
  return (
    <section className="card">
      <div className="section-header compact">
        <div>
          <p className="section-label">System flow</p>
          <h3>FloodGuard architecture</h3>
        </div>
      </div>

      <div className="architecture-flow">
        <div className="flow-box">
          <h4>Official Signals</h4>
          <p>Rainfall, warnings, and water-trend indicators</p>
        </div>
        <div className="flow-arrow">→</div>
        <div className="flow-box">
          <h4>Risk Engine</h4>
          <p>Combines signals into an explainable local risk level</p>
        </div>
        <div className="flow-arrow">→</div>
        <div className="flow-box">
          <h4>Dashboard</h4>
          <p>Shows alert level, reasons, local reports, and actions</p>
        </div>
      </div>

      <div className="architecture-footer">
        <div className="mini-box">
          <h5>Public Signals</h5>
          <p>Residents submit local incident observations</p>
        </div>
        <div className="mini-box future">
          <h5>Future AI Imaging</h5>
          <p>Uploaded flood images can support visual severity analysis</p>
        </div>
      </div>
    </section>
  );
}

// #dashboard composition
export default function App() {
  const areas = useFloodguardAreas();
  const [selectedAreaId, setSelectedAreaId] = useState("parramatta");
  const [activeView, setActiveView] = useState("overview");
  const { signals, sourceStatus, liveStatus } = useParramattaSignals(selectedAreaId);
  const selectedArea = areas.find((area) => area.id === selectedAreaId);
  const signalsAreaId = signals.area?.id ?? "parramatta";
  const hasSelectedAreaSignals = signalsAreaId === selectedAreaId;
  const history = useAreaHistory(selectedAreaId, liveStatus.lastUpdated);
  const communityReportState = useCommunityReports(selectedAreaId, liveStatus.lastUpdated);
  const evidenceReviewQueue = useEvidenceReviewQueue(selectedAreaId, liveStatus.lastUpdated);
  const featureDataset = useAreaFeatures(selectedAreaId, liveStatus.lastUpdated);
  const datasetQuality = useDatasetQuality(selectedAreaId, liveStatus.lastUpdated);
  const baselinePrediction = useBaselinePrediction(selectedAreaId, liveStatus.lastUpdated);
  const modelExperiment = useModelExperiment(selectedAreaId, liveStatus.lastUpdated);
  const modelCard = useModelCard(selectedAreaId, liveStatus.lastUpdated);
  const dashboardData = hasSelectedAreaSignals
    ? buildDashboardData(signals, sourceStatus, liveStatus)
    : null;
  const selectedAreaName = selectedArea?.name ?? selectedAreaId;

  return (
    <div className="app-shell">
      <Header />
      <AreaSelector
        areas={areas}
        selectedAreaId={selectedAreaId}
        liveStatus={liveStatus}
        onAreaChange={setSelectedAreaId}
      />
      <AppNavigation activeView={activeView} onViewChange={setActiveView} />

      {!hasSelectedAreaSignals && (
        <AreaDataGuard areaName={selectedAreaName} liveStatus={liveStatus} />
      )}

      {hasSelectedAreaSignals && activeView === "overview" && (
        <>
          <OverviewPanel data={dashboardData} />
          <FrontPageSummary data={dashboardData} />
          <EvidencePanel evidence={dashboardData.evidence} />
        </>
      )}

      {hasSelectedAreaSignals && activeView === "signals" && (
        <section className="section-page">
          <SourceHealthPanel
            ingestionHealth={dashboardData.ingestionHealth}
            sources={dashboardData.sourceHealth}
          />
          <LocationRelevancePanel relevance={dashboardData.locationRelevance} />
          <DecisionAuditPanel audit={dashboardData.decisionAudit} />
          <SignalBreakdownChart riskSignals={dashboardData.riskSignals} />
          <RainfallChart rainfallTrend={dashboardData.rainfallTrend} />
          <RiverStatusPanel
            areaName={dashboardData.areaName}
            riverSummary={dashboardData.riverSummary}
          />
          <MapPanel areaName={dashboardData.areaName} />
        </section>
      )}

      {hasSelectedAreaSignals && activeView === "community" && (
        <section className="section-page community-page">
          <div className="community-column">
            <ReportsPanel reports={dashboardData.reports} />
            <EvidenceReviewPanel queue={evidenceReviewQueue} />
          </div>
          <div className="community-column">
            <CommunityReportPanel
              publicSignalSummary={dashboardData.publicSignalSummary}
              reportState={communityReportState}
            />
          </div>
        </section>
      )}

      {hasSelectedAreaSignals && activeView === "model" && (
        <section className="section-page model-page">
          <HistoryPanel history={history} />
          <FeatureReadinessPanel dataset={featureDataset} />
          <DatasetQualityPanel quality={datasetQuality} />
          <BaselinePredictionPanel baseline={baselinePrediction} />
          <ModelExperimentPanel experiment={modelExperiment} />
          <ModelCardPanel modelCard={modelCard} />
        </section>
      )}

      {hasSelectedAreaSignals && activeView === "architecture" && (
        <section className="section-page architecture-page">
          <ArchitecturePanel />
          <EvidencePanel evidence={dashboardData.evidence} />
        </section>
      )}
    </div>
  );
}

// #location context map card
function MapPanel({ areaName }) {
  const shortAreaName = areaName.replace(", NSW", "");

  return (
    <section className="card location-card">
      <div className="section-header compact">
        <div>
          <p className="section-label">Location context</p>
          <h3>Incident map snapshot</h3>
        </div>
      </div>

      <div className="map-panel">
        <div className="map-grid"></div>
        <div className="map-catchment-glow"></div>
        <div className="map-river"></div>
        <div className="map-river-label">Parramatta River corridor</div>

        <div className="map-label suburb">{areaName}</div>
        <div className="map-focus-ring"></div>
        <div className="map-label precinct">Active community reports</div>

        <div className="map-pin high" style={{ top: "28%", left: "68%" }}>
        </div>
        <div className="map-event-label high" style={{ top: "23%", left: "73%" }}>
          Road pooling
        </div>
        <div className="map-pin moderate" style={{ top: "48%", left: "42%" }}>
        </div>
        <div className="map-event-label moderate" style={{ top: "43%", left: "47%" }}>
          Creek watch
        </div>
        <div className="map-pin low" style={{ top: "66%", left: "74%" }}>
        </div>
        <div className="map-event-label low" style={{ top: "62%", left: "56%" }}>
          Minor debris
        </div>

        <div className="map-road road-1"></div>
        <div className="map-road road-2"></div>
        <div className="map-road road-3"></div>
        <div className="map-neighbourhood north">North Parramatta</div>
        <div className="map-neighbourhood south">Parramatta CBD</div>
        <div className="map-legend">
          <span className="legend-dot high"></span>
          High
          <span className="legend-dot moderate"></span>
          Moderate
          <span className="legend-dot low"></span>
          Low
        </div>
      </div>

      <p className="map-note">
        Snapshot combines suburb focus, river corridor, and clustered report severity around {shortAreaName}.
      </p>
    </section>
  );
}
