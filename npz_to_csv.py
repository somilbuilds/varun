"""
npz_to_csv.py
=============
Converts the clean fused dataset (.npz) into a flat CSV file, one row per
(date, lat, lon) combination -- the format most spreadsheet tools and
quick-look CSV viewers expect.

USAGE
-----
    python npz_to_csv.py datasets/clean_data/maharashtra_climate_....npz

Produces a CSV next to the input file, e.g.:
    datasets/clean_data/maharashtra_climate_....csv

CSV COLUMNS
-----------
    date, lat, lon, rainfall_mm, max_temp_c, min_temp_c
"""

import sys
import csv
import numpy as np
from pathlib import Path


def convert(npz_path: Path):
    data = np.load(npz_path)
    fused = data["fused"]      # (days, lat, lon, 3)
    dates = data["dates"]      # (days,)
    lats = data["lats"]        # (lat,)
    lons = data["lons"]        # (lon,)

    n_days, n_lat, n_lon, n_ch = fused.shape
    print(f"Loaded {npz_path.name}: {n_days} days x {n_lat} lat x {n_lon} lon")

    out_path = npz_path.with_suffix(".csv")

    rows_written = 0
    with open(out_path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["date", "lat", "lon", "rainfall_mm", "max_temp_c", "min_temp_c"])

        for d in range(n_days):
            for i, lat in enumerate(lats):
                for j, lon in enumerate(lons):
                    rain, maxt, mint = fused[d, i, j, :]

                    def fmt(v):
                        return "" if np.isnan(v) else round(float(v), 2)

                    writer.writerow([dates[d], lat, lon, fmt(rain), fmt(maxt), fmt(mint)])
                    rows_written += 1

    print(f"Wrote {rows_written} rows to {out_path}")
    return out_path


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python npz_to_csv.py <path-to-npz-file>")
        sys.exit(1)

    npz_path = Path(sys.argv[1])
    if not npz_path.exists():
        print(f"File not found: {npz_path}")
        sys.exit(1)

    convert(npz_path)
