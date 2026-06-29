"""Generate frontend/src/data/clipped-cells.json from the Maharashtra boundary GeoJSON."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BOUNDARY = ROOT / "frontend" / "src" / "data" / "maharashtra-boundary.geojson"
OUTPUT = ROOT / "frontend" / "src" / "data" / "clipped-cells.json"

LAT_S, LAT_N, LON_W, LON_E = 15.5, 22.0, 72.5, 80.5
ROWS, COLS = 27, 33
LAT_STEP = (LAT_N - LAT_S) / ROWS
LON_STEP = (LON_E - LON_W) / COLS
GRADIENT_W, GRADIENT_H = 264, 216


def point_in_ring(x: float, y: float, ring: list) -> bool:
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi + 1e-15) + xi:
            inside = not inside
        j = i
    return inside


def in_boundary(lon: float, lat: float, boundary: dict) -> bool:
    for feature in boundary["features"]:
        geometry = feature["geometry"]
        polys = [geometry["coordinates"]]
        if geometry["type"] == "MultiPolygon":
            polys = geometry["coordinates"]
        for poly in polys:
            if point_in_ring(lon, lat, poly[0]) and not any(
                point_in_ring(lon, lat, hole) for hole in poly[1:]
            ):
                return True
    return False


def main() -> int:
    if not BOUNDARY.is_file():
        print(f"ERROR: boundary file not found: {BOUNDARY}", flush=True)
        return 1

    boundary = json.loads(BOUNDARY.read_text(encoding="utf-8"))
    cells = []
    rects = []

    for row in range(ROWS):
        for col in range(COLS):
            south = LAT_S + row * LAT_STEP
            west = LON_W + col * LON_STEP
            center_lat = south + LAT_STEP / 2
            center_lon = west + LON_STEP / 2
            if not in_boundary(center_lon, center_lat, boundary):
                continue
            north = south + LAT_STEP
            east = west + LON_STEP
            x = (west - LON_W) / (LON_E - LON_W) * GRADIENT_W
            y = (LAT_N - north) / (LAT_N - LAT_S) * GRADIENT_H
            w = (east - west) / (LON_E - LON_W) * GRADIENT_W
            h = (north - south) / (LAT_N - LAT_S) * GRADIENT_H
            cells.append(
                {"row": row, "col": col, "centerLat": center_lat, "centerLon": center_lon}
            )
            rects.append([row, col, x, y, w, h])

    payload = {"cells": cells, "rects": rects, "count": len(cells)}
    OUTPUT.write_text(json.dumps(payload), encoding="utf-8")
    print(f"Wrote {len(cells)} clipped cells to {OUTPUT}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
