import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { GridChannel, PlaceholderGridData } from "./types";

type GridCellProperties = {
  row: number;
  col: number;
  value: number;
  channel: GridChannel;
  unit: string;
  centerLat: number;
  centerLon: number;
};

export type GridFeatureCollection = FeatureCollection<Polygon, GridCellProperties>;
export type BoundaryFeatureCollection = FeatureCollection<Polygon | MultiPolygon>;

export function buildGridGeoJson(
  data: PlaceholderGridData,
  channel: GridChannel,
): GridFeatureCollection {
  const matrix = data.values[channel];
  const { rows, cols } = data.gridShape;

  if (!matrix || matrix.length !== rows || matrix.some((row) => row.length !== cols)) {
    throw new Error(`Grid data for ${channel} must match ${rows} rows x ${cols} columns.`);
  }

  const latStep = (data.bbox.north - data.bbox.south) / rows;
  const lonStep = (data.bbox.east - data.bbox.west) / cols;

  return {
    type: "FeatureCollection",
    features: matrix.flatMap((rowValues, row) =>
      rowValues.map((value, col) => {
        const south = data.bbox.south + row * latStep;
        const north = south + latStep;
        const west = data.bbox.west + col * lonStep;
        const east = west + lonStep;

        return {
          type: "Feature" as const,
          properties: {
            row,
            col,
            value,
            channel,
            unit: data.units[channel],
            centerLat: (south + north) / 2,
            centerLon: (west + east) / 2,
          },
          geometry: {
            type: "Polygon" as const,
            coordinates: [
              [
                [west, south],
                [east, south],
                [east, north],
                [west, north],
                [west, south],
              ],
            ],
          },
        };
      }),
    ),
  };
}

export function getValueRange(data: PlaceholderGridData, channel: GridChannel) {
  const values = data.values[channel].flat();
  return {
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

export function filterGridToBoundary(
  grid: GridFeatureCollection,
  boundary: BoundaryFeatureCollection,
): GridFeatureCollection {
  return {
    type: "FeatureCollection",
    features: grid.features.filter((feature) =>
      pointInBoundary(
        [feature.properties.centerLon, feature.properties.centerLat],
        boundary,
      ),
    ),
  };
}

function pointInBoundary(point: [number, number], boundary: BoundaryFeatureCollection) {
  return boundary.features.some((feature) => {
    const geometry = feature.geometry;
    if (geometry.type === "Polygon") {
      return pointInPolygon(point, geometry.coordinates);
    }
    if (geometry.type === "MultiPolygon") {
      return geometry.coordinates.some((polygon) => pointInPolygon(point, polygon));
    }
    return false;
  });
}

function pointInPolygon(point: [number, number], rings: number[][][]) {
  const [outerRing, ...holes] = rings;
  if (!pointInRing(point, outerRing)) {
    return false;
  }
  return !holes.some((ring) => pointInRing(point, ring));
}

function pointInRing([x, y]: [number, number], ring: number[][]) {
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];

    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}
