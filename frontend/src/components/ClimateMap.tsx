import { useMemo } from "react";
import { GeoJSON, MapContainer, Polygon, TileLayer } from "react-leaflet";
import type { FeatureCollection, MultiPolygon, Polygon as GeoJsonPolygon } from "geojson";
import gridData from "../data/maharashtra-grid-placeholder.json";
import boundaryDataRaw from "../data/maharashtra-boundary.geojson?raw";
import { buildGridGeoJson, filterGridToBoundary, getValueRange } from "../grid";
import type { PlaceholderGridData } from "../types";

const MAP_CENTER: [number, number] = [18.75, 76.5];
const MAP_ZOOM = 7;
const RAINFALL_CHANNEL = "rainfall_mm";
const OSM_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

const typedGridData = gridData as PlaceholderGridData;
const typedBoundaryData = JSON.parse(boundaryDataRaw) as FeatureCollection<
  GeoJsonPolygon | MultiPolygon
>;

export default function ClimateMap() {
  const gridGeoJson = useMemo(() => {
    const fullGrid = buildGridGeoJson(typedGridData, RAINFALL_CHANNEL);
    return filterGridToBoundary(fullGrid, typedBoundaryData);
  }, []);
  const range = useMemo(() => getValueRange(typedGridData, RAINFALL_CHANNEL), []);

  return (
    <section className="map-shell" aria-label="Maharashtra rainfall grid map">
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
        {gridGeoJson.features.map((feature) => {
          const value = feature.properties.value;
          const positions = feature.geometry.coordinates[0].map(
            ([lon, lat]) => [lat, lon] as [number, number],
          );

          return (
            <Polygon
              key={`${feature.properties.row}-${feature.properties.col}`}
              className="climate-grid-cell"
              positions={positions}
              pathOptions={{
                color: "#0f172a",
                fillColor: getRainfallColor(value),
                fillOpacity: 0.68,
                opacity: 0.72,
                weight: 1.2,
              }}
            />
          );
        })}
        <GeoJSON
          data={typedBoundaryData}
          className="maharashtra-boundary"
          pathOptions={{
            color: "#111827",
            fillColor: "#f8fafc",
            fillOpacity: 0.08,
            opacity: 0.95,
            weight: 3,
          }}
        />
      </MapContainer>
      <RainfallLegend min={range.min} max={range.max} unit={typedGridData.units.rainfall_mm} />
    </section>
  );
}

function getRainfallColor(value: number) {
  if (value >= 100) return "#d62828";
  if (value >= 75) return "#ffb703";
  if (value >= 50) return "#219ebc";
  if (value >= 25) return "#8ecae6";
  return "#eef8ff";
}

function RainfallLegend({ min, max, unit }: { min: number; max: number; unit: string }) {
  return (
    <div className="legend" aria-label="Rainfall color scale">
      <div className="legend-header">
        <span>Rainfall</span>
        <span>{unit}</span>
      </div>
      <div className="legend-ramp" />
      <div className="legend-values">
        <span>{min}</span>
        <span>{Math.round((min + max) / 2)}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}
