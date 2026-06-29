import { memo, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer } from "react-leaflet";
import { extractChannelGrid, getChannelLabel, getChannelUnit } from "../channelUtils";
import { getLegendStops } from "../colors";
import type {
  ApiChannelValues,
  ApiGridPayload,
  DisplayChannel,
  MapRenderMode,
  ViewMode,
} from "../types";
import {
  fetchClimatology,
  fetchForecast,
  fetchHistorical,
  fetchNowcast,
  getHistoricalFromCache,
  getModePayloadFromCache,
  prefetchHistoricalDates,
} from "../api";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import GradientOverlay from "./GradientOverlay";
import GridCellsLayer from "./GridCellsLayer";
import BoundaryLayer from "./BoundaryLayer";
import type { TimelineFrame } from "./TimeSlider";
import { historyDateFromIndex } from "./TimeSlider";
import { HISTORY_START } from "../types";

const MAP_CENTER: [number, number] = [18.75, 76.5];
const MAP_ZOOM = 7;
const OSM_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

const EMPTY_TIMELINE: TimelineFrame[] = [];

export type MapDataContext = {
  frameValues: ApiChannelValues | null;
  activeDate?: string;
  timelineFrames: TimelineFrame[];
};

type Props = {
  mode: ViewMode;
  historyDate: string;
  timelineIndex: number;
  displayChannel: DisplayChannel;
  renderMode: MapRenderMode;
  isPlaying: boolean;
  onDataContextChange?: (ctx: MapDataContext) => void;
};

type LoadState = "idle" | "loading" | "ok" | "error";

const ColorLegend = memo(function ColorLegend({
  channel,
  unit,
  min,
  max,
}: {
  channel: DisplayChannel;
  unit: string;
  min: number;
  max: number;
}) {
  const stops = getLegendStops(channel);
  const gradient = `linear-gradient(90deg, ${stops.join(", ")})`;
  const label = getChannelLabel(channel);

  return (
    <div className="legend" aria-label={`${label} color scale`}>
      <div className="legend-header">
        <span>{label}</span>
        <span>{unit}</span>
      </div>
      <div className="legend-ramp" style={{ background: gradient }} />
      <div className="legend-values">
        <span>{min.toFixed(1)}</span>
        <span>{((min + max) / 2).toFixed(1)}</span>
        <span>{max.toFixed(1)}</span>
      </div>
    </div>
  );
});

export default memo(function ClimateMap({
  mode,
  historyDate,
  timelineIndex,
  displayChannel,
  renderMode,
  isPlaying,
  onDataContextChange,
}: Props) {
  const [payload, setPayload] = useState<ApiGridPayload | null>(() => {
    if (mode === "historical") return getHistoricalFromCache(historyDate) ?? null;
    return getModePayloadFromCache(mode) ?? null;
  });
  const [loadState, setLoadState] = useState<LoadState>(() =>
    payload ? "ok" : "loading",
  );
  const [errorMsg, setErrorMsg] = useState("");
  const fetchSeq = useRef(0);
  const onDataContextChangeRef = useRef(onDataContextChange);
  onDataContextChangeRef.current = onDataContextChange;

  const debouncedHistoryDate = useDebouncedValue(
    historyDate,
    isPlaying ? 0 : 200,
    isPlaying,
  );

  useEffect(() => {
    const seq = ++fetchSeq.current;

    const applyCached = (): boolean => {
      const cached =
        mode === "historical"
          ? getHistoricalFromCache(debouncedHistoryDate)
          : getModePayloadFromCache(mode);
      if (cached) {
        setPayload(cached);
        setLoadState("ok");
        setErrorMsg("");
        return true;
      }
      return false;
    };

    if (applyCached()) return;

    setLoadState((prev) => (prev === "ok" ? prev : "loading"));
    setErrorMsg("");

    (async () => {
      try {
        let data: ApiGridPayload;
        if (mode === "climatology") data = await fetchClimatology();
        else if (mode === "nowcast") data = await fetchNowcast();
        else if (mode === "forecast") data = await fetchForecast();
        else data = await fetchHistorical(debouncedHistoryDate);

        if (seq !== fetchSeq.current) return;
        setPayload(data);
        setLoadState("ok");
      } catch (err: unknown) {
        if (seq !== fetchSeq.current) return;
        setErrorMsg(err instanceof Error ? err.message : String(err));
        setLoadState("error");
      }
    })();
  }, [mode, debouncedHistoryDate]);

  useEffect(() => {
    if (mode !== "historical" || !isPlaying) return;
    prefetchHistoricalDates([
      historyDateFromIndex(timelineIndex + 1, HISTORY_START),
      historyDateFromIndex(timelineIndex + 2, HISTORY_START),
    ]);
  }, [mode, isPlaying, timelineIndex]);

  const timelineFrames = useMemo((): TimelineFrame[] => {
    if ((mode === "nowcast" || mode === "forecast") && payload?.daily_frames?.length) {
      return payload.daily_frames.map((frame) => ({
        date: frame.date,
        frameType: frame.frame_type,
      }));
    }
    return EMPTY_TIMELINE;
  }, [mode, payload]);

  const safeTimelineIndex = useMemo(() => {
    if (timelineFrames.length === 0) return 0;
    return Math.max(0, Math.min(timelineIndex, timelineFrames.length - 1));
  }, [timelineIndex, timelineFrames.length]);

  const frameValues = useMemo((): ApiChannelValues | null => {
    if (!payload) return null;
    if (mode === "nowcast" || mode === "forecast") {
      const frames = payload.daily_frames;
      if (frames?.length) {
        return frames[safeTimelineIndex]?.values ?? payload.values;
      }
    }
    return payload.values;
  }, [payload, mode, safeTimelineIndex]);

  const activeDate = useMemo(() => {
    if (mode === "historical") return historyDate;
    if (timelineFrames.length > 0) {
      return timelineFrames[safeTimelineIndex]?.date;
    }
    return payload?.date ?? payload?.data_as_of;
  }, [mode, historyDate, timelineFrames, safeTimelineIndex, payload]);

  const frameKey = `${mode}|${activeDate ?? "none"}|${safeTimelineIndex}`;

  useEffect(() => {
    onDataContextChangeRef.current?.({
      frameValues,
      activeDate,
      timelineFrames,
    });
  }, [frameValues, activeDate, timelineFrames]);

  const valueGrid = useMemo(
    () => extractChannelGrid(frameValues ?? undefined, displayChannel),
    [frameValues, displayChannel],
  );

  const { minVal, maxVal } = useMemo(() => {
    if (!valueGrid) return { minVal: 0, maxVal: 100 };
    let min = Infinity;
    let max = -Infinity;
    for (const row of valueGrid) {
      for (const v of row) {
        if (v !== null && Number.isFinite(v)) {
          if (v < min) min = v;
          if (v > max) max = v;
        }
      }
    }
    if (!Number.isFinite(min)) return { minVal: 0, maxVal: 100 };
    return { minVal: min, maxVal: max };
  }, [valueGrid]);

  const statusLabel = buildStatusLabel(
    mode,
    payload,
    activeDate,
    safeTimelineIndex,
    timelineFrames.length,
  );
  const unit = getChannelUnit(displayChannel);
  const showGrid = renderMode === "grid";
  const showGradient = renderMode === "gradient" && loadState === "ok";

  return (
    <section className="map-shell" aria-label="Maharashtra climate map">
      <div className="map-status-bar">
        <span className={`status-badge status-badge--${loadState}`}>
          {loadState === "loading" ? "Loading…" : loadState === "error" ? "Error" : statusLabel}
        </span>
        {loadState === "error" && (
          <span className="status-error-msg" title={errorMsg}>
            {errorMsg.slice(0, 160)}
          </span>
        )}
      </div>

      <MapContainer
        center={MAP_CENTER}
        zoom={MAP_ZOOM}
        className="map-canvas"
        scrollWheelZoom
        preferCanvas
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url={OSM_TILE_URL}
        />

        {showGradient && (
          <GradientOverlay
            valueGrid={valueGrid}
            displayChannel={displayChannel}
            minVal={minVal}
            maxVal={maxVal}
            frameKey={frameKey}
            visible
          />
        )}

        {showGrid && (
          <GridCellsLayer
            valueGrid={valueGrid}
            displayChannel={displayChannel}
            ready={loadState === "ok"}
          />
        )}

        <BoundaryLayer />
      </MapContainer>

      <ColorLegend channel={displayChannel} unit={unit} min={minVal} max={maxVal} />
    </section>
  );
});

function buildStatusLabel(
  mode: ViewMode,
  payload: ApiGridPayload | null,
  activeDate: string | undefined,
  frameIndex: number,
  frameCount: number,
): string {
  if (!payload) return "…";
  if (mode === "climatology") {
    return `Historical average · ${payload.date_range?.[0]} → ${payload.date_range?.[1]}`;
  }
  if (mode === "nowcast") {
    const day = activeDate ?? payload.data_as_of ?? "?";
    const suffix = frameCount > 1 ? ` · day ${frameIndex + 1}/${frameCount}` : "";
    return `Observed · ${day} · IMD daily data${suffix}`;
  }
  if (mode === "forecast") {
    const frame = payload.daily_frames?.[frameIndex];
    if (frame?.frame_type === "forecast") {
      return `AI forecast · ${frame.date} · ConvLSTM one-day-ahead`;
    }
    return `Observed · ${activeDate ?? payload.data_as_of ?? "?"} · before forecast`;
  }
  return `Historical · ${activeDate ?? payload.date ?? "?"}`;
}
