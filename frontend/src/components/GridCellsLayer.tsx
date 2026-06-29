import { memo, useMemo } from "react";
import { Polygon } from "react-leaflet";
import { getCellColor } from "../colors";
import type { DisplayChannel } from "../types";
import { CLIPPED_CELLS, LAT_STEP, LON_STEP } from "../gridCells";

type Props = {
  valueGrid: (number | null)[][] | null;
  displayChannel: DisplayChannel;
  ready: boolean;
};

function GridCellsLayer({ valueGrid, displayChannel, ready }: Props) {
  const polygons = useMemo(
    () =>
      CLIPPED_CELLS.map(({ row, col, centerLat, centerLon }) => {
        const value = valueGrid ? (valueGrid[row]?.[col] ?? null) : null;
        const south = centerLat - LAT_STEP / 2;
        const north = centerLat + LAT_STEP / 2;
        const west = centerLon - LON_STEP / 2;
        const east = centerLon + LON_STEP / 2;

        return {
          key: `${row}-${col}`,
          positions: [
            [south, west],
            [south, east],
            [north, east],
            [north, west],
          ] as [number, number][],
          fillColor: valueGrid ? getCellColor(value, displayChannel) : "#e5e7eb",
        };
      }),
    [valueGrid, displayChannel],
  );

  return (
    <>
      {polygons.map(({ key, positions, fillColor }) => (
        <Polygon
          key={key}
          className="climate-grid-cell"
          positions={positions}
          pathOptions={{
            color: "#0f172a",
            fillColor,
            fillOpacity: ready ? 0.72 : 0.25,
            opacity: 0.6,
            weight: 0.8,
          }}
        />
      ))}
    </>
  );
}

export default memo(GridCellsLayer);
