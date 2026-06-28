import ClimateMap from "./components/ClimateMap";
import PlaceholderPanel from "./components/PlaceholderPanel";

export default function App() {
  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Maharashtra Climate Digital Twin</p>
          <h1>Grid-cell rainfall view</h1>
        </div>
        <p className="header-meta">IMD 27x33 Maharashtra grid · Leaflet + OpenStreetMap</p>
      </header>

      <div className="dashboard-grid">
        <ClimateMap />

        <aside className="side-panels" aria-label="Reserved dashboard panels">
          <PlaceholderPanel
            title="What-if scenario sliders"
            codeMarker="TODO: connect analog scenario controls here."
          />
          <PlaceholderPanel
            title="3-day forecast chart"
            codeMarker="TODO: render real ConvLSTM/baseline outputs here."
          />
          <PlaceholderPanel
            title="Anomaly flag display"
            codeMarker="TODO: show computed grid-cell rainfall/heat anomaly flags here."
          />
        </aside>
      </div>
    </main>
  );
}
