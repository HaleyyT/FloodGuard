import { useCallback, useEffect, useState } from "react";
import "./App.css";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
} from "recharts";

import { buildPublicSignalCards } from "./data/parramattaSignals";
import {
  fetchAreaFeatures,
  fetchAreaHistory,
  fetchFloodguardAreas,
  fetchParramattaSignals,
  localParramattaSignals,
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
    primaryHeight: primaryStation?.heightM ?? null,
    primaryTendency: primaryStation?.tendency || "unknown",
    highestStationName: highestStation?.stationName || "Unknown station",
    highestHeight: highestStation?.heightM ?? null,
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
  return (signals.rainfallSeries?.points ?? []).map((point) => ({
    time: new Date(point.time).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
    }),
    rainfall: point.rainfallMm,
  }));
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

function buildDashboardData(signals, sourceStatus, liveStatus) {
  const areaName = signals.area?.name || signals.location.name;
  const riverSummary = summariseRiverData(signals.riverContext);
  const publicSignalCards = buildPublicSignalCards(signals);
  const riskAssessment = buildRiskAssessment(signals, riverSummary, publicSignalCards);
  const latestRain = signals.rainfallSeries.latestValidRainfallMm;
  const rainDisplay = latestRain !== null ? `${latestRain} mm` : "No recent reading";
  const dataStatus =
    sourceStatus === "api" && signals.freshness?.status === "stale"
      ? "Live API with stale source"
      : sourceStatus === "api" && signals.freshness?.status === "mixed"
      ? "Live API with fallback source"
      : sourceStatus === "api"
      ? "Live API ingestion synced"
      : "Local fallback signals loaded";

  return {
    areaName,
    location: signals.location.name,
    riskLevel: riskAssessment.riskLevel,
    summary: riskAssessment.summary,
    riverSummary,
    rainfallTrend: buildRainfallTrend(signals),
    riskSignals: buildRiskSignals(signals),

    officialSignals: {
      warningStatus: liveStatus.isRefreshing ? "Refreshing live area signals" : dataStatus,
      areaSignalFit: formatAreaSignalFit(signals.areaRelevance),
      sourceFreshness: formatSourceFreshness(signals.freshness),
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
    ],
  };
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

// #signal visualisation rainfall chart
function RainfallChart({ rainfallTrend }) {
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
          <LineChart data={rainfallTrend}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="time" />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey="rainfall" strokeWidth={3} />
          </LineChart>
        </ResponsiveContainer>
      </div>
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
          label="Data Status"
          value={data.officialSignals.warningStatus}
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

// #local situational awareness card
function ReportsPanel({ reports }) {
  return (
    <section className="card">
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
  const { signals, sourceStatus, liveStatus } = useParramattaSignals(selectedAreaId);
  const history = useAreaHistory(selectedAreaId, liveStatus.lastUpdated);
  const featureDataset = useAreaFeatures(selectedAreaId, liveStatus.lastUpdated);
  const dashboardData = buildDashboardData(signals, sourceStatus, liveStatus);

  return (
    <div className="app-shell">
      <Header />
      <AreaSelector
        areas={areas}
        selectedAreaId={selectedAreaId}
        liveStatus={liveStatus}
        onAreaChange={setSelectedAreaId}
      />

      <OverviewPanel data={dashboardData} />

      <div className="main-grid">
        <div className="left-column">
          <FactorsPanel factors={dashboardData.contributingFactors} />
          <ReportsPanel reports={dashboardData.reports} />
          <EvidencePanel evidence={dashboardData.evidence} />
          <HistoryPanel history={history} />
          <FeatureReadinessPanel dataset={featureDataset} />
        </div>

        <div className="right-column">
          <ActionsPanel actions={dashboardData.recommendedActions} />
          <RiverStatusPanel
            areaName={dashboardData.areaName}
            riverSummary={dashboardData.riverSummary}
          />
          <RainfallChart rainfallTrend={dashboardData.rainfallTrend} />
          <SignalBreakdownChart riskSignals={dashboardData.riskSignals} />
          <MapPanel areaName={dashboardData.areaName} />
        </div>
      </div>

      <ArchitecturePanel />
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
        <div className="map-river"></div>

        <div className="map-label suburb">{areaName}</div>

        <div className="map-pin high" style={{ top: "28%", left: "68%" }}>
          !
        </div>
        <div className="map-pin moderate" style={{ top: "48%", left: "42%" }}>
          !
        </div>
        <div className="map-pin low" style={{ top: "66%", left: "74%" }}>
          !
        </div>

        <div className="map-road road-1"></div>
        <div className="map-road road-2"></div>
      </div>

      <p className="map-note">
      Prototype view showing flood-related community reports positioned around {shortAreaName}.
      </p>
    </section>
  );
}
