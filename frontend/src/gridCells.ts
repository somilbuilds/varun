import type { FeatureCollection } from "geojson";
import clippedData from "./data/clipped-cells.json";

export const LAT_SOUTH = 15.5;
export const LAT_NORTH = 22.0;
export const LON_WEST = 72.5;
export const LON_EAST = 80.5;
export const GRID_ROWS = 27;
export const GRID_COLS = 33;

export const GRADIENT_WIDTH = 264;
export const GRADIENT_HEIGHT = 216;

export const GRADIENT_BOUNDS: [[number, number], [number, number]] = [
  [LAT_SOUTH, LON_WEST],
  [LAT_NORTH, LON_EAST],
];

export const LAT_STEP = (LAT_NORTH - LAT_SOUTH) / GRID_ROWS;
export const LON_STEP = (LON_EAST - LON_WEST) / GRID_COLS;

export type GridCell = {
  row: number;
  col: number;
  centerLat: number;
  centerLon: number;
};

export const CLIPPED_CELLS: GridCell[] = clippedData.cells;

export const CLIPPED_CELL_RECTS: ReadonlyArray<
  readonly [row: number, col: number, x: number, y: number, w: number, h: number]
> = clippedData.rects as ReadonlyArray<
  readonly [number, number, number, number, number, number]
>;

/** Lazy-load the heavy boundary GeoJSON only when the map outline is needed. */
let boundaryPromise: Promise<FeatureCollection> | null = null;

export function loadBoundaryGeoJson(): Promise<FeatureCollection> {
  if (!boundaryPromise) {
    boundaryPromise = fetch("/maharashtra-boundary.geojson")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load Maharashtra boundary");
        return res.json() as Promise<FeatureCollection>;
      })
      .catch((err) => {
        boundaryPromise = null;
        throw err;
      });
  }
  return boundaryPromise;
}

export const CLIPPED_CELL_COUNT: number = clippedData.count;
