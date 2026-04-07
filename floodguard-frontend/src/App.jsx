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

import { parramattaSignals } from "./data/parramattaSignals";


const rainfallTrend = [
  { time: "6am", rainfall: 8 },
  { time: "8am", rainfall: 14 },
  { time: "10am", rainfall: 22 },
  { time: "12pm", rainfall: 31 },
  { time: "2pm", rainfall: 18 },
  { time: "4pm", rainfall: 26 },
];

const riskSignals = [
  { name: "Rainfall", value: 82 },
  { name: "Warning", value: 90 },
  { name: "Water Trend", value: 72 },
  { name: "Reports", value: 65 },
];

const dashboardData = {
  location: "Parramatta, NSW",
  riskLevel: "High",
  summary:
    "FloodGuard has identified elevated local flood risk based on heavy recent rainfall, an active official warning, and multiple nearby community incident reports.",
  officialSignals: {
    warningStatus: "Official flood warning active",
    rainfall24h: "82 mm",
    waterTrend: "River level rising",
    forecastOutlook: "Further rainfall expected in next 6 hours",
  },
  contributingFactors: [
    "Heavy rainfall recorded in the last 24 hours",
    "Active official flood warning for the region",
    "Rising river-level trend",
    "Three nearby community reports submitted recently",
  ],
  recommendedActions: [
    "Avoid low-lying roads and flood-prone crossings",
    "Monitor official warnings and prepare essentials",
    "Use caution when travelling near local creeks and drains",
  ],
  reports: [
    {
      id: 1,
      title: "Road flooding reported near Church Street",
      time: "1 hour ago",
      severity: "Moderate",
      description:
        "Resident reported shallow flooding across one lane with slow-moving traffic.",
    },
    {
      id: 2,
      title: "Water rising near local creek pathway",
      time: "35 mins ago",
      severity: "High",
      description:
        "Pathway near creek becoming unsafe due to rapidly rising water level.",
    },
    {
      id: 3,
      title: "Stormwater drain overflow observed",
      time: "20 mins ago",
      severity: "Low",
      description:
        "Local drain overflow visible after intense rainfall, minor surface pooling nearby.",
    },
  ],
  evidence: [
    {
      label: "Risk Signals Integrated",
      value: "4",
      note: "Rainfall, warning status, water trend, and community reports",
    },
    {
      label: "Recent Community Reports",
      value: "3",
      note: "Used to strengthen local situational awareness",
    },
    {
      label: "Risk Decision Type",
      value: "Explainable",
      note: "Each alert includes contributing factors and action guidance",
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
          <h3>Recent community reports</h3>
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

