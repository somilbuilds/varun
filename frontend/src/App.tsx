import { useState } from "react";
import ClimateMap from "./components/ClimateMap";
import ValidationChart from "./components/ValidationChart";
import DateScrubber from "./components/DateScrubber";
import PlaceholderPanel from "./components/PlaceholderPanel";
import type { ViewMode } from "./types";

const VIEW_MODES: { id: ViewMode; label: string; icon: string }[] = [
  { id: "climatology", label: "Historical Avg", icon: "📊" },
  { id: "historical",  label: "History",        icon: "🗓" },
  { id: "nowcast",     label: "Now",            icon: "🌧" },
  { id: "forecast",    label: "Tomorrow",       icon: "🔮" },
];

const CHANNELS: { id: "rainfall" | "max_temp" | "min_temp"; label: string }[] = [
  { id: "rainfall",  label: "Rainfall" },
  { id: "max_temp",  label: "Max Temp" },
  { id: "min_temp",  label: "Min Temp" },
];

// Default history date: midway through the dataset for a non-trivial first view
const DEFAULT_HISTORY_DATE = "2020-07-15";

export default function App() {
  const [mode, setMode] = useState<ViewMode>("climatology");
  const [historyDate, setHistoryDate] = useState(DEFAULT_HISTORY_DATE);
  const [displayChannel, setDisplayChannel] = useState<"rainfall" | "max_temp" | "min_temp">("rainfall");

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">ISRO BAH 2026 — PS-5 · Maharashtra Climate Digital Twin</p>
          <h1>VARUN — Virtual Atmospheric Replica for Understanding &amp; Nowcasting</h1>
        </div>
        <p className="header-meta">
          IMD 27×33 grid · 450 Maharashtra cells · Leaflet + OpenStreetMap · Real data only
        </p>
      </header>

      {/* ── Mode + channel controls ── */}
      <div className="controls-bar">
        <div className="mode-tabs" role="tablist" aria-label="View mode">
          {VIEW_MODES.map(({ id, label, icon }) => (
            <button
              key={id}
              role="tab"
              aria-selected={mode === id}
              className={`mode-tab${mode === id ? " mode-tab--active" : ""}`}
              onClick={() => setMode(id)}
            >
              <span className="tab-icon">{icon}</span>
              {label}
            </button>
          ))}
        </div>

        <div className="channel-tabs" role="tablist" aria-label="Display channel">
          {CHANNELS.map(({ id, label }) => (
            <button
              key={id}
              role="tab"
              aria-selected={displayChannel === id}
              className={`channel-tab${displayChannel === id ? " channel-tab--active" : ""}`}
              onClick={() => setDisplayChannel(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Date scrubber — only shown in historical mode */}
        {mode === "historical" && (
          <DateScrubber value={historyDate} onChange={setHistoryDate} />
        )}
      </div>

      {/* ── Main dashboard grid ── */}
      <div className="dashboard-grid">
        <ClimateMap
          mode={mode}
          historyDate={historyDate}
          displayChannel={displayChannel}
        />

        <aside className="side-panels" aria-label="Dashboard panels">
          {/* Real validation metrics chart */}
          <div className="panel panel--metrics">
            <div className="panel-title-row">
              <h2>Model Validation</h2>
              <span className="panel-badge panel-badge--real">Real data</span>
            </div>
            <ValidationChart />
          </div>

          {/* What-if sliders — explicitly deferred, stays as placeholder */}
          <PlaceholderPanel
            title="What-if scenario sliders"
            codeMarker="Coming next: analog scenario engine — historical-nearest-neighbour matching on user-defined Δrainfall / Δtemp perturbations."
          />

          {/* Anomaly flags — coming after analog engine */}
          <PlaceholderPanel
            title="Anomaly flag display"
            codeMarker="Coming after analog engine: per-cell rainfall/heat anomaly flags vs. historical percentiles (no flood-risk claims — see context.md §3)."
          />
        </aside>
      </div>
    </main>
  );
}
