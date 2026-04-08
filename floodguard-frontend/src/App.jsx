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

import { parramattaSignals, publicSignalCards, parramattaRiverData} from "./data/parramattaSignals";

const riverSummary = summariseRiverData(parramattaRiverData);

const rainfallTrend = parramattaSignals.rainfallSeries.points.map((point) => ({
  time: new Date(point.time).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  }),
  rainfall: point.rainfallMm,
}));

// Build risk signals for the breakdown chart based on the prototype inputs and some heuristics to combine them into a score out of 100 for each category
const riskSignals = buildRiskSignals(parramattaSignals);

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

// helper function to build risk signals based on the prototype inputs, with some simple heuristics to combine them into a score out of 100 for each category
export function buildRiskSignals(signals) {
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
  let coverageCount = 0;

  if (weather.stationName) coverageCount += 1;
  if (rainfallPoints.length > 0) coverageCount += 1;
  if (riverStations.length > 0) coverageCount += 1;
  if ((signals.communityReports ?? []).length > 0) coverageCount += 1;

  const coverageScore = clamp(coverageCount * 25);

  return [
    { name: "Rainfall", value: rainfallScore },
    { name: "Weather", value: weatherScore },
    { name: "River", value: riverScore },
    { name: "Coverage", value: coverageScore },
  ];
}



function summariseRiverData(riverData) {
  const stations = riverData.stations || [];

  const primaryStation =
    stations.find((s) => s.station_name.includes("Parramatta River at Riverside Theatre")) ||
    stations.find((s) => s.station_name.includes("Parramatta River")) ||
    stations[0];

  const highestStation = stations.reduce((max, station) => {
    if (!max || station.height_m > max.height_m) return station;
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
    issuedDate: riverData.issued_date,
    stationCount: stations.length,
    primaryStationName: primaryStation?.station_name || "Unknown station",
    primaryHeight: primaryStation?.height_m ?? null,
    primaryTendency: primaryStation?.tendency || "unknown",
    highestStationName: highestStation?.station_name || "Unknown station",
    highestHeight: highestStation?.height_m ?? null,
    tendencyCounts,
  };
}

function buildRiskAssessment(parramattaSignals, riverSummary, publicSignalCards) {
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
    reasons,
    summary:
      riskLevel === "High"
        ? "FloodGuard has identified elevated local flood concern from combined rainfall, river, and public signal inputs."
        : riskLevel === "Moderate"
        ? "FloodGuard has identified moderate local flood concern using recent rainfall, public observations, and Parramatta river-context signals."
        : "FloodGuard currently indicates low immediate flood concern while continuing to monitor rainfall and river conditions.",
  };
}


// Build the dashboard data structure based on the prototype inputs, transforming and combining them as needed to create a comprehensive view for the dashboard components
const riskAssessment = buildRiskAssessment(
  parramattaSignals,
  riverSummary,
  publicSignalCards
);

const latestRain = parramattaSignals.rainfallSeries.latestValidRainfallMm;
const rainDisplay =
  latestRain !== null ? `${latestRain} mm` : "No recent reading";



const reports = [
  {
    id: 1,
    title: "Parramatta weather observation update",
    time: "04 Apr, 9:00am",
    severity: "Low",
    description:
      "BoM observations recorded cloudy conditions, SSE wind at 7 km/h, visibility of 15 km, and a rain trace of 0.4 mm.",
  },
  {
    id: 2,
    title: "North Parramatta rainfall gauge update",
    time: "02 Apr",
    severity: "Moderate",
    description:
      "Nearby rainfall gauge data shows measurable rainfall on 26 Mar (10.5 mm) and 27 Mar (5.0 mm), followed by several low or dry days.",
  },
  {
    id: 3,
    title: "Parramatta River context pending integration",
    time: "Latest public river source",
    severity: "Moderate",
    description:
      "River-height context is being prepared for ingestion so the dashboard can show a live local water-trend signal.",
  },
];

const dashboardData = {
  location: parramattaSignals.location.name,
  riskLevel: riskAssessment.riskLevel,
  summary: riskAssessment.summary,

  officialSignals: {
    warningStatus: "Public Parramatta rainfall and river signals loaded",
    rainfall24h: rainDisplay,
    waterTrend: `${riverSummary.primaryTendency} at ${riverSummary.primaryStationName}`,
    forecastOutlook: `River feed issued ${riverSummary.issuedDate}`,
  },

  contributingFactors: [
    ...riskAssessment.reasons,
    `Primary river station: ${riverSummary.primaryStationName} (${riverSummary.primaryHeight} m)`,
    `${riverSummary.stationCount} monitored river/creek stations included in current feed`,
  ],

  recommendedActions: [
    "Monitor flood-prone crossings, creek paths, and river-adjacent walkways",
    "Check official warnings and local updates before travelling",
    "Use caution if rainfall resumes or water levels begin rising nearby",
  ],

  reports: reports,

  evidence: [
    {
      label: "Target Area",
      value: "Parramatta",
      note: "Prototype focused on local suburban flood awareness in Parramatta, NSW",
    },
    {
      label: "River Stations",
      value: String(riverSummary.stationCount),
      note: `${riverSummary.tendencyCounts.steady} steady, ${riverSummary.tendencyCounts.falling} falling, ${riverSummary.tendencyCounts.rising} rising`,
    },
    {
      label: "Current Output",
      value: riskAssessment.riskLevel,
      note: "Explainable local flood-risk level derived from visible factors",
    },
  ],
};


function RainfallChart() {
  return (
    <section className="card">
      <div className="section-header compact">
        <div>
          <p className="section-label">Signal visualisation</p>
          <h3>Recent rainfall trend</h3>
        </div>
      </div>
      <div className="chart-box">
        <ResponsiveContainer width="100%" height={240}>
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

function SignalBreakdownChart() {
  return (
    <section className="card">
      <div className="section-header compact">
        <div>
          <p className="section-label">Decision evidence</p>
          <h3>Risk signal breakdown</h3>
        </div>
      </div>
      <div className="chart-box">
        <ResponsiveContainer width="100%" height={240}>
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
          label="Warning Status"
          value={data.officialSignals.warningStatus}
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
          label="Short-Term Outlook"
          value={data.officialSignals.forecastOutlook}
        />
      </div>
    </section>
  );
}

function InfoTile({ label, value }) {
  return (
    <div className="info-tile">
      <p className="section-label">{label}</p>
      <h3>{value}</h3>
    </div>
  );
}

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
          <h5>Community Reports</h5>
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

export default function App() {
  return (
    <div className="app-shell">
      <Header />

      <OverviewPanel data={dashboardData} />

      <div className="main-grid">
        <div className="left-column">
          <FactorsPanel factors={dashboardData.contributingFactors} />
          <ReportsPanel reports={dashboardData.reports} />
          <EvidencePanel evidence={dashboardData.evidence} />
        </div>

        <div className="right-column">
          <ActionsPanel actions={dashboardData.recommendedActions} />
          <MapPanel />
          <RainfallChart />
          <SignalBreakdownChart />
        </div>
      </div>

      <ArchitecturePanel />
    </div>
  );
}

function MapPanel() {
  return (
    <section className="card">
      <div className="section-header compact">
        <div>
          <p className="section-label">Location context</p>
          <h3>Incident map snapshot</h3>
        </div>
      </div>

      <div className="map-panel">
        <div className="map-river"></div>

        <div className="map-label suburb">Parramatta, NSW</div>

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
        Prototype view showing flood-related community reports positioned around
        the monitored region.
      </p>
    </section>
  );
}

