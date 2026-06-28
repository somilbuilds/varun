"""
IMD Gridded Data Parser
========================
Reads IMD's binary .GRD format for:
  - Rainfall (0.25deg x 0.25deg, 135x129 grid points)
  - Max/Min Temperature (1.0deg x 1.0deg, 31x31 grid points)

Format reference (from IMD Pune documentation):
  Rainfall:
    - Grid: 135 (lon) x 129 (lat) points
    - Lon: 66.5E to 100.0E, step 0.25 (135 points)
    - Lat: 6.5N to 38.5N, step 0.25 (129 points)
    - Missing value: -999.0
    - Fortran: DIMENSION RF(366,ISIZ,JSIZ), READ ((RF(IDAY,I,J),I=1,ISIZ),J=1,JSIZ)
      -> I (lon, 135) varies fastest within a record, J (lat, 129) is outer loop

  Temperature (Max/Min):
    - Grid: 31 (lat) x 31 (lon) points
    - Lat: 7.5N to 37.5N, step 1.0 (31 points)
    - Lon: 67.5E to 97.5E, step 1.0 (31 points)
    - Missing value: 99.9
    - Fortran: DIMENSION T(366,ISIZ,JSIZ), READ ((T(IDAY,I,J),J=1,JSIZ),I=1,ISIZ)
      -> J (lon, 31) varies fastest, I (lat, 31) is outer loop

All files are direct-access unformatted binary, record length = grid_size * 4 bytes
(single-precision float32), one record per day, little-endian on standard x86 systems.
"""

import numpy as np
from pathlib import Path

# ---- Grid specifications (from IMD documentation) ----

RAINFALL_SPEC = {
    "lon_n": 135, "lat_n": 129,
    "lon_start": 66.5, "lon_step": 0.25,
    "lat_start": 6.5, "lat_step": 0.25,
    "missing_value": -999.0,
}

TEMP_SPEC = {
    "lat_n": 31, "lon_n": 31,
    "lat_start": 7.5, "lat_step": 1.0,
    "lon_start": 67.5, "lon_step": 1.0,
    "missing_value": 99.9,
}


def _days_in_year(year: int) -> int:
    """Standard leap year rule (matches IMD's 365/366 day file convention)."""
    is_leap = (year % 4 == 0 and (year % 100 != 0 or year % 400 == 0))
    return 366 if is_leap else 365


def read_rainfall_grd(path, year: int) -> np.ndarray:
    """
    Read one year of IMD gridded rainfall.
    Returns array of shape (days, lat=129, lon=135), oriented south->north, west->east.
    """
    spec = RAINFALL_SPEC
    ndays = _days_in_year(year)
    expected_floats = ndays * spec["lon_n"] * spec["lat_n"]

    data = np.fromfile(path, dtype="<f4")
    if data.size != expected_floats:
        raise ValueError(
            f"{path}: got {data.size} floats, expected {expected_floats} "
            f"for year {year} ({ndays} days x {spec['lon_n']}x{spec['lat_n']}). "
            f"Check year/leap-year assumption or file corruption."
        )

    # Fortran: I (lon, fastest) inner loop, J (lat) outer loop per day record
    # -> numpy row-major reshape gives (days, lat, lon) directly
    arr = data.reshape(ndays, spec["lat_n"], spec["lon_n"])
    return arr


def read_temp_grd(path, year: int) -> np.ndarray:
    """
    Read one year of IMD gridded max/min temperature.
    Returns array of shape (days, lat=31, lon=31).
    """
    spec = TEMP_SPEC
    ndays = _days_in_year(year)
    expected_floats = ndays * spec["lat_n"] * spec["lon_n"]

    data = np.fromfile(path, dtype="<f4")
    if data.size != expected_floats:
        raise ValueError(
            f"{path}: got {data.size} floats, expected {expected_floats} "
            f"for year {year} ({ndays} days x {spec['lat_n']}x{spec['lon_n']}). "
            f"Check year/leap-year assumption or file corruption."
        )

    # Fortran: J (lon, fastest) inner loop, I (lat) outer loop per day record
    # -> numpy row-major reshape gives (days, lat, lon) directly
    arr = data.reshape(ndays, spec["lat_n"], spec["lon_n"])
    return arr


def rainfall_coords():
    spec = RAINFALL_SPEC
    lats = spec["lat_start"] + np.arange(spec["lat_n"]) * spec["lat_step"]
    lons = spec["lon_start"] + np.arange(spec["lon_n"]) * spec["lon_step"]
    return lats, lons


def temp_coords():
    spec = TEMP_SPEC
    lats = spec["lat_start"] + np.arange(spec["lat_n"]) * spec["lat_step"]
    lons = spec["lon_start"] + np.arange(spec["lon_n"]) * spec["lon_step"]
    return lats, lons


def mask_missing(arr: np.ndarray, missing_value: float, tol: float = 0.5) -> np.ndarray:
    """Replace missing-value flagged cells with np.nan."""
    out = arr.copy()
    out[np.abs(out - missing_value) < tol] = np.nan
    return out


if __name__ == "__main__":
    # Quick self-test against the 2025 sample files
    base = Path(__file__).resolve().parent.parent / "data"

    rf = read_rainfall_grd(base / "Rainfall_ind2025_rfp25.grd", 2025)
    maxt = read_temp_grd(base / "Maxtemp_MaxT_2025.GRD", 2025)
    mint = read_temp_grd(base / "Mintemp_MinT_2025.GRD", 2025)

    print("Rainfall shape:", rf.shape)
    print("MaxT shape:", maxt.shape)
    print("MinT shape:", mint.shape)

    rlats, rlons = rainfall_coords()
    tlats, tlons = temp_coords()
    print("\nRainfall lat range:", rlats.min(), "-", rlats.max())
    print("Rainfall lon range:", rlons.min(), "-", rlons.max())
    print("Temp lat range:", tlats.min(), "-", tlats.max())
    print("Temp lon range:", tlons.min(), "-", tlons.max())
