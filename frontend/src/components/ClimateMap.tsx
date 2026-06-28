import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GeoJSON, MapContainer, Polygon, TileLayer } from "react-leaflet";
import type { FeatureCollection, MultiPolygon, Polygon as GeoJsonPolygon } from "geojson";
import boundaryDataRaw from "../data/maharashtra-boundary.geojson?raw";
import { filterGridToBoundary } from "../grid";
import type { ApiGridPayload, ViewMode } from "../types";
import {
  fetchClimatology,
  fetchHistorical,
  fetchNowcast,
  fetchForecast,
} from "../api";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const MAP_CENTER: [number, number] = [18.75, 76.5];
const MAP_ZOOM = 7;
const OSM_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

const LAT_SOUTH = 15.5;
const LAT_NORTH = 22.0;
const LON_WEST = 72.5;
const LON_EAST = 80.5;
const GRID_ROWS = 27;
const GRID_COLS = 33;

const boundaryData = JSON.parse(boundaryDataRaw) as FeatureCollection<
  GeoJsonPolygon | MultiPolygon
>;

// Pre-compute lat/lon steps
const LAT_STEP = (LAT_NORTH - LAT_SOUTH) / GRID_ROWS;
const LON_STEP = (LON_EAST - LON_WEST) / GRID_COLS;

// Pre-compute which cells are inside Maharashtra boundary (450 cells)
const ALL_CELLS = (() => {
  const cells: { row: number; col: number; centerLat: number; centerLon: number }[] = [];
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const south = LAT_SOUTH + r * LAT_STEP;
      const west = LON_WEST + c * LON_STEP;
      cells.push({
        row: r,
        col: c,
        centerLat: south + LAT_STEP / 2,
        centerLon: west + LON_STEP / 2,
      });
    }
  }
  return cells;
})();

// Use the boundary-clip utility from grid.ts; we need a mini FeatureCollection
// that filterGridToBoundary can operate on.
const CLIPPED_CELLS = (() => {
  const fakeFC: FeatureCollection<GeoJsonPolygon, { row: number; col: number; centerLat: number; centerLon: number; value: number; channel: "rainfall_mm"; unit: string }> = {
    type: "FeatureCollection",
    features: ALL_CELLS.map((cell) => ({
      type: "Feature",
      properties: { ...cell, value: 0, channel: "rainfall_mm" as const, unit: "mm" },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [cell.centerLon - LON_STEP / 2, cell.centerLat - LAT_STEP / 2],
          [cell.centerLon + LON_STEP / 2, cell.centerLat - LAT_STEP / 2],
          [cell.centerLon + LON_STEP / 2, cell.centerLat + LAT_STEP / 2],
          [cell.centerLon - LON_STEP / 2, cell.centerLat + LAT_STEP / 2],
          [cell.centerLon - LON_STEP / 2, cell.centerLat - LAT_STEP / 2],
        ]],
      },
    })),
  };
  return filterGridToBoundary(fakeFC, boundaryData);
})();

// ---------------------------------------------------------------------------
// Color scale (rainfall mm/day)
// ---------------------------------------------------------------------------
function getRainfallColor(value: number | null): string {
  if (value === null || value === undefined) return "#ccc";
  if (value >= 100) return "#d62828";
  if (value >= 64) return "#e85d04";
  if (value >= 35) return "#ffb703";
  if (value >= 15) return "#219ebc";
  if (value >= 5)  return "#8ecae6";
  return "#eef8ff";
}

function getTempColor(value: number | null, channel: "max_temp" | "min_temp"): string {
  if (value === null || value === undefined) return "#ccc";
  if (channel === "max_temp") {
    if (value >= 44) return "#7f0000";
    if (value >= 40) return "#d62828";
    if (value >= 36) return "#f4a261";
    if (value >= 32) return "#ffb703";
    if (value >= 28) return "#8ecae6";
    return "#caf0f8";
  } else {
    if (value >= 28) return "#d62828";
    if (value >= 24) return "#ffb703";
    if (value >= 20) return "#8ecae6";
    if (value >= 16) return "#caf0f8";
    return "#e0f7fa";
  }
}

function getCellColor(
  value: number | null,
  displayChannel: "rainfall" | "max_temp" | "min_temp"
): string {
  if (displayChannel === "rainfall") return getRainfallColor(value);
  return getTempColor(value, displayChannel);
}

// ---------------------------------------------------------------------------
// Props / Component
// ---------------------------------------------------------------------------
type Props = {
  mode: ViewMode;
  historyDate: string;
  displayChannel: "rainfall" | "max_temp" | "min_temp";
};

type LoadState = "idle" | "loading" | "ok" | "error";

export default function ClimateMap({ mode, historyDate, displayChannel }: Props) {
  const [payload, setPayload] = useState<ApiGridPayload | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");

  // track latest fetch to ignore stale responses
  const fetchSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++fetchSeq.current;
    setLoadState("loading");
    setErrorMsg("");
    try {
      let data: ApiGridPayload;
      if (mode === "climatology") data = await fetchClimatology();
      else if (mode === "nowcast") data = await fetchNowcast();
      else if (mode === "forecast") data = await fetchForecast();
      else data = await fetchHistorical(historyDate);

      if (seq !== fetchSeq.current) return; // stale
      setPayload(data);
      setLoadState("ok");
    } catch (err: unknown) {
      if (seq !== fetchSeq.current) return;
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setLoadState("error");
    }
  }, [mode, historyDate]);

  useEffect(() => { load(); }, [load]);

  const valueGrid: (number | null)[][] | null = useMemo(() => {
    if (!payload) return null;
    return payload.values[displayChannel] ?? null;
  }, [payload, displayChannel]);

  const { minVal, maxVal } = useMemo(() => {
    if (!valueGrid) return { minVal: 0, maxVal: 100 };
    const flat = valueGrid.flat().filter((v): v is number => v !== null);
    if (flat.length === 0) return { minVal: 0, maxVal: 100 };
    return { minVal: Math.min(...flat), maxVal: Math.max(...flat) };
  }, [valueGrid]);

  const statusLabel = buildStatusLabel(mode, payload);
  const unit = payload?.units[displayChannel] ?? "";

  return (
    <section className="map-shell" aria-label="Maharashtra climate grid map">
      {/* Status bar above the map */}
      <div className="map-status-bar">
        <span className={`status-badge status-badge--${loadState}`}>
          {loadState === "loading" ? "Loading…" : loadState === "error" ? "Error" : statusLabel}
        </span>
        {loadState === "error" && (
          <span className="status-error-msg" title={errorMsg}>
            {errorMsg.slice(0, 120)}
          </span>
        )}
      </div>

      <MapContainer
        center={MAP_CENTER}
        zoom={MAP_ZOOM}
        className="map-canvas"
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url={OSM_TILE_URL}
        />

        {/* Grid cells — only the 450 Maharashtra-clipped ones */}
        {CLIPPED_CELLS.features.map((feature) => {
          const { row, col, centerLat, centerLon } = feature.properties;
          const value = valueGrid ? (valueGrid[row]?.[col] ?? null) : null;
          const south = centerLat - LAT_STEP / 2;
          const north = centerLat + LAT_STEP / 2;
          const west = centerLon - LON_STEP / 2;
          const east = centerLon + LON_STEP / 2;

          return (
            <Polygon
              key={`${row}-${col}`}
              className="climate-grid-cell"
              positions={[
                [south, west],
                [south, east],
                [north, east],
                [north, west],
              ]}
              pathOptions={{
                color: "#0f172a",
                fillColor: valueGrid ? getCellColor(value, displayChannel) : "#e5e7eb",
                fillOpacity: loadState === "ok" ? 0.72 : 0.25,
                opacity: 0.6,
                weight: 0.8,
              }}
            >
            </Polygon>
          );
        })}

        {/* State boundary */}
        <GeoJSON
          data={boundaryData}
          className="maharashtra-boundary"
          pathOptions={{
            color: "#111827",
            fillColor: "transparent",
            fillOpacity: 0,
            opacity: 0.95,
            weight: 2.5,
          }}
        />
      </MapContainer>

      <ColorLegend channel={displayChannel} unit={unit} min={minVal} max={maxVal} />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Legend
// ---------------------------------------------------------------------------
function ColorLegend({
  channel,
  unit,
  min,
  max,
}: {
  channel: "rainfall" | "max_temp" | "min_temp";
  unit: string;
  min: number;
  max: number;
}) {
  const stops =
    channel === "rainfall"
      ? ["#eef8ff", "#8ecae6", "#219ebc", "#ffb703", "#e85d04", "#d62828"]
      : channel === "max_temp"
      ? ["#caf0f8", "#8ecae6", "#ffb703", "#f4a261", "#d62828", "#7f0000"]
      : ["#e0f7fa", "#caf0f8", "#8ecae6", "#ffb703", "#d62828"];

  const gradient = `linear-gradient(90deg, ${stops.join(", ")})`;
  const label = channel === "rainfall" ? "Rainfall" : channel === "max_temp" ? "Max Temp" : "Min Temp";

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
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function buildStatusLabel(mode: ViewMode, payload: ApiGridPayload | null): string {
  if (!payload) return "…";
  if (mode === "climatology") {
    return `Historical average · ${payload.date_range?.[0]} → ${payload.date_range?.[1]}`;
  }
  if (mode === "nowcast") {
    return `Current state · Data as of ${payload.data_as_of ?? "?"} (IMD ~1 day lag)`;
  }
  if (mode === "forecast") {
    return `AI forecast · Predicting ${payload.prediction_date ?? "?"} · Model: ConvLSTM`;
  }
  return `Historical · ${payload.date ?? "?"}`;
}
