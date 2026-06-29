import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import ClimateMap, { type MapDataContext } from "./components/ClimateMap";
import ChannelToolbar from "./components/ChannelToolbar";
import TimeSlider, {
  historyDateFromIndex,
  historyDayCount,
  historyIndexFromDate,
} from "./components/TimeSlider";
import ValidationChart from "./components/ValidationChart";
import PlaceholderPanel from "./components/PlaceholderPanel";
import AnomalyPreviewPanel from "./components/AnomalyPreviewPanel";
import ApiStatusBanner from "./components/ApiStatusBanner";
import { fetchClimatology, prefetchHistoricalDates } from "./api";
import type { ApiChannelValues, ApiGridPayload, DisplayChannel, MapRenderMode, ViewMode } from "./types";
import { HISTORY_END, HISTORY_START } from "./types";

const VIEW_MODES: { id: ViewMode; label: string; icon: string }[] = [
  { id: "climatology", label: "Historical Avg", icon: "📊" },
  { id: "historical", label: "History", icon: "🗓" },
  { id: "nowcast", label: "Now", icon: "🌧" },
  { id: "forecast", label: "Tomorrow", icon: "🔮" },
];

const DEFAULT_HISTORY_DATE = "2020-07-15";
const HISTORY_DAY_COUNT = historyDayCount(HISTORY_START, HISTORY_END);
const PLAY_INTERVAL_MS = 900;

const resolveHistoryFrame = (index: number) => ({
  date: historyDateFromIndex(index, HISTORY_START),
  frameType: "observed" as const,
});

export default function App() {
  const [mode, setMode] = useState<ViewMode>("climatology");
  const [historyDate, setHistoryDate] = useState(DEFAULT_HISTORY_DATE);
  const [timelineIndex, setTimelineIndex] = useState(() =>
    historyIndexFromDate(DEFAULT_HISTORY_DATE, HISTORY_START),
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [displayChannel, setDisplayChannel] = useState<DisplayChannel>("rainfall");
  const [renderMode, setRenderMode] = useState<MapRenderMode>("grid");
  const [climatology, setClimatology] = useState<ApiGridPayload | null>(null);
  const [frameValues, setFrameValues] = useState<ApiChannelValues | null>(null);
  const [activeDate, setActiveDate] = useState<string | undefined>();
  const [timelineFrames, setTimelineFrames] = useState<MapDataContext["timelineFrames"]>([]);

  useEffect(() => {
    fetchClimatology()
      .then(setClimatology)
      .catch(() => setClimatology(null));
  }, []);

  const handleModeChange = (nextMode: ViewMode) => {
    setMode(nextMode);
    setIsPlaying(false);
    if (nextMode === "historical") {
      setTimelineIndex(historyIndexFromDate(historyDate, HISTORY_START));
    } else if (nextMode === "nowcast" || nextMode === "forecast") {
      setTimelineIndex(0);
    }
  };

  const showTimeline =
    mode === "historical" ||
    ((mode === "nowcast" || mode === "forecast") && timelineFrames.length > 0);

  const handleTimelineChange = useCallback(
    (index: number) => {
      setTimelineIndex(index);
      if (mode === "historical") {
        setHistoryDate(historyDateFromIndex(index, HISTORY_START));
      }
    },
    [mode],
  );

  useEffect(() => {
    if (!isPlaying || !showTimeline) return;

    const timer = window.setInterval(() => {
      setTimelineIndex((current) => {
        const maxIndex =
          mode === "historical"
            ? HISTORY_DAY_COUNT - 1
            : Math.max(0, timelineFrames.length - 1);

        if (current >= maxIndex) {
          setIsPlaying(false);
          return current;
        }

        const next = current + 1;
        if (mode === "historical") {
          setHistoryDate(historyDateFromIndex(next, HISTORY_START));
        }
        return next;
      });
    }, PLAY_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [isPlaying, showTimeline, mode, timelineFrames.length]);

  useEffect(() => {
    if (mode !== "historical" || !isPlaying) return;
    prefetchHistoricalDates([
      historyDateFromIndex(timelineIndex + 1, HISTORY_START),
      historyDateFromIndex(timelineIndex + 2, HISTORY_START),
      historyDateFromIndex(timelineIndex + 3, HISTORY_START),
    ]);
  }, [mode, isPlaying, timelineIndex]);

  const handleDataContextChange = useCallback((ctx: MapDataContext) => {
    setFrameValues((prev) => (prev === ctx.frameValues ? prev : ctx.frameValues));
    setActiveDate((prev) => (prev === ctx.activeDate ? prev : ctx.activeDate));
    setTimelineFrames((prev) =>
      prev === ctx.timelineFrames ? prev : ctx.timelineFrames,
    );
  }, []);

  const prevModeRef = useRef(mode);
  useEffect(() => {
    if (mode !== prevModeRef.current) {
      prevModeRef.current = mode;
      if (
        (mode === "nowcast" || mode === "forecast") &&
        timelineFrames.length > 0
      ) {
        setTimelineIndex(timelineFrames.length - 1);
      }
    }
  }, [mode, timelineFrames.length]);

  return (
    <main className="app-shell">
      <ApiStatusBanner />
      <header className="app-header">
        <div>
          <p className="eyebrow">ISRO BAH 2026 — PS-5 · Maharashtra Climate Digital Twin</p>
          <h1>VARUN — Virtual Atmospheric Replica for Understanding &amp; Nowcasting</h1>
        </div>
        <p className="header-meta">
          IMD daily 27×33 grid · 450 Maharashtra cells · Leaflet + OpenStreetMap · Real data only
        </p>
      </header>

      <div className="controls-bar">
        <div className="mode-tabs" role="tablist" aria-label="View mode">
          {VIEW_MODES.map(({ id, label, icon }) => (
            <button
              key={id}
              role="tab"
              aria-selected={mode === id}
              className={`mode-tab${mode === id ? " mode-tab--active" : ""}`}
              onClick={() => handleModeChange(id)}
            >
              <span className="tab-icon">{icon}</span>
              {label}
            </button>
          ))}
        </div>

        <div className="render-mode-toggle" role="group" aria-label="Map render style">
          <button
            type="button"
            className={`render-mode-btn${renderMode === "grid" ? " render-mode-btn--active" : ""}`}
            onClick={() => setRenderMode("grid")}
          >
            Grid
          </button>
          <button
            type="button"
            className={`render-mode-btn${renderMode === "gradient" ? " render-mode-btn--active" : ""}`}
            onClick={() => setRenderMode("gradient")}
          >
            Gradient
          </button>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="map-workspace">
          <ChannelToolbar value={displayChannel} onChange={setDisplayChannel} />

          <div className="map-column">
            <ClimateMap
              mode={mode}
              historyDate={historyDate}
              timelineIndex={timelineIndex}
              displayChannel={displayChannel}
              renderMode={renderMode}
              isPlaying={isPlaying}
              onDataContextChange={handleDataContextChange}
            />

            {showTimeline && mode === "historical" && (
              <TimeSlider
                mode="count"
                frameCount={HISTORY_DAY_COUNT}
                resolveFrame={resolveHistoryFrame}
                index={timelineIndex}
                onChange={handleTimelineChange}
                isPlaying={isPlaying}
                onPlayToggle={() => setIsPlaying((p) => !p)}
                resolutionLabel="Daily"
              />
            )}

            {showTimeline && mode !== "historical" && timelineFrames.length > 0 && (
              <TimeSlider
                mode="frames"
                frames={timelineFrames}
                index={timelineIndex}
                onChange={handleTimelineChange}
                isPlaying={isPlaying}
                onPlayToggle={() => setIsPlaying((p) => !p)}
                resolutionLabel="Daily"
              />
            )}
          </div>
        </div>

        <aside className="side-panels" aria-label="Dashboard panels">
          <div className="panel panel--metrics">
            <div className="panel-title-row">
              <h2>Model Validation</h2>
              <span className="panel-badge panel-badge--real">Real data</span>
            </div>
            <ValidationChart />
          </div>

          <PlaceholderPanel
            title="What-if scenario sliders"
            codeMarker="Coming next: analog scenario engine — historical-nearest-neighbour matching on user-defined Δrainfall / Δtemp perturbations."
          />

          <AnomalyPreviewPanel
            currentValues={frameValues}
            climatology={climatology}
            activeDate={activeDate}
          />
        </aside>
      </div>
    </main>
  );
}
