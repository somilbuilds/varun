"""
build_dataset.py
=================
STAGE 1 -- "Build the clean dataset" (run this rarely, only when you add new raw files)

WHAT THIS DOES
--------------
1. Scans raw_data/rainfall/, raw_data/maxtemp/, raw_data/mintemp/ for IMD .GRD files.
2. Auto-detects which year each file belongs to from its filename.
3. Reads every year it can find a COMPLETE matching trio for (rainfall + maxT + minT).
4. Crops every year to the Maharashtra bounding box.
5. Regrids temperature (1deg) onto rainfall's finer grid (0.25deg).
6. Stacks rainfall + maxT + minT into one fused tensor per year, then
   concatenates all years together in chronological order.
7. Saves ONE clean .npz file into clean_data/, named with the years covered
   and a timestamp, so old runs are never overwritten.

FOLDER LAYOUT THIS SCRIPT EXPECTS (create this once):

    maharashtra_climate_project/
    +-- raw_data/
    |   +-- rainfall/      <- put every Rainfall_ind*.grd file here
    |   +-- maxtemp/       <- put every Maxtemp_MaxT_*.GRD file here
    |   +-- mintemp/       <- put every Mintemp_MinT_*.GRD file here
    +-- clean_data/        <- this script creates output files here automatically
    +-- build_dataset.py   <- this file, lives in the root

HOW TO RUN
----------
    python build_dataset.py

Every run produces a NEW file (never overwrites), e.g.:
    clean_data/maharashtra_climate_2020-2025_built_2026-06-28_1142.npz

WHAT'S INSIDE THE OUTPUT FILE
------------------------------
A single .npz (numpy zip) archive containing:
    fused      : array (total_days, lat, lon, 3)  -- channels = [rainfall, maxT, minT]
    dates      : array (total_days,) of date strings "YYYY-MM-DD", aligned to `fused`
    lats       : array (lat,) -- latitude values for the Maharashtra grid used
    lons       : array (lon,) -- longitude values for the Maharashtra grid used
    years_used : array of years actually included
To load it later (in the training script):
    data = np.load("clean_data/maharashtra_climate_....npz")
    fused = data["fused"]; dates = data["dates"]
"""

import re
import sys
import numpy as np
from pathlib import Path
from datetime import datetime, date, timedelta

# Make sure we can import the parser/fusion modules regardless of where this is run from
SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR / "scripts"))

from imd_parser import (
    read_rainfall_grd, read_temp_grd, mask_missing, RAINFALL_SPEC, TEMP_SPEC,
    rainfall_coords, temp_coords,
)
from maharashtra_fusion import crop_to_bbox, regrid_nearest, MAHARASHTRA_BBOX


RAW_DIR = SCRIPT_DIR / "datasets" / "raw_data"
CLEAN_DIR = SCRIPT_DIR / "datasets" / "clean_data"

RAINFALL_DIR = RAW_DIR / "rainfall"
MAXTEMP_DIR = RAW_DIR / "maxtemp"
MINTEMP_DIR = RAW_DIR / "mintemp"

# Filename patterns -> capture the year
RAINFALL_PATTERN = re.compile(r"(\d{4})", re.IGNORECASE)
MAXTEMP_PATTERN = re.compile(r"(\d{4})", re.IGNORECASE)
MINTEMP_PATTERN = re.compile(r"(\d{4})", re.IGNORECASE)


def find_year_files(folder: Path, pattern: re.Pattern, exts=(".grd",)) -> dict:
    """Scan a folder for files matching extension, return {year: path}."""
    found = {}
    if not folder.exists():
        return found
    for f in folder.iterdir():
        if f.suffix.lower() not in exts:
            continue
        m = pattern.search(f.stem)
        if not m:
            print(f"  [skip] {f.name}: couldn't detect a 4-digit year in filename")
            continue
        year = int(m.group(1))
        if year < 1900 or year > 2100:
            continue
        found[year] = f
    return found


def days_in_year(year: int) -> int:
    is_leap = (year % 4 == 0 and (year % 100 != 0 or year % 400 == 0))
    return 366 if is_leap else 365


def date_strings_for_year(year: int) -> list:
    start = date(year, 1, 1)
    n = days_in_year(year)
    return [(start + timedelta(days=i)).isoformat() for i in range(n)]


def build_one_year(year, rf_path, maxt_path, mint_path, bbox=MAHARASHTRA_BBOX, verbose=True):
    """Load, crop, regrid, fuse one year. Returns (fused_year, lats, lons) or None on failure."""
    try:
        rf = read_rainfall_grd(rf_path, year)
        maxt = read_temp_grd(maxt_path, year)
        mint = read_temp_grd(mint_path, year)
    except ValueError as e:
        print(f"  [ERROR] year {year}: {e}")
        return None

    rf = mask_missing(rf, RAINFALL_SPEC["missing_value"])
    maxt = mask_missing(maxt, TEMP_SPEC["missing_value"])
    mint = mask_missing(mint, TEMP_SPEC["missing_value"])

    rf_lats, rf_lons = rainfall_coords()
    t_lats, t_lons = temp_coords()

    rf_crop, rf_lats_c, rf_lons_c = crop_to_bbox(rf, rf_lats, rf_lons, bbox)
    maxt_crop, t_lats_c, t_lons_c = crop_to_bbox(maxt, t_lats, t_lons, bbox)
    mint_crop, _, _ = crop_to_bbox(mint, t_lats, t_lons, bbox)

    if rf_crop.shape[1] == 0 or rf_crop.shape[2] == 0:
        print(f"  [ERROR] year {year}: rainfall crop is empty -- check bbox")
        return None
    if maxt_crop.shape[1] == 0 or maxt_crop.shape[2] == 0:
        print(f"  [ERROR] year {year}: temperature crop is empty -- check bbox vs 1deg grid spacing")
        return None

    maxt_regrid = regrid_nearest(maxt_crop, t_lats_c, t_lons_c, rf_lats_c, rf_lons_c)
    mint_regrid = regrid_nearest(mint_crop, t_lats_c, t_lons_c, rf_lats_c, rf_lons_c)

    fused_year = np.stack([rf_crop, maxt_regrid, mint_regrid], axis=-1)

    if verbose:
        nan_rain = np.isnan(fused_year[..., 0]).mean()
        nan_maxt = np.isnan(fused_year[..., 1]).mean()
        nan_mint = np.isnan(fused_year[..., 2]).mean()
        print(f"  [ok] year {year}: shape={fused_year.shape}  "
              f"NaN%% rain={nan_rain:.1%} maxT={nan_maxt:.1%} minT={nan_mint:.1%}")

    return fused_year, rf_lats_c, rf_lons_c


def main():
    print("=" * 70)
    print("STAGE 1: Building clean fused Maharashtra climate dataset")
    print("=" * 70)

    for d in (RAINFALL_DIR, MAXTEMP_DIR, MINTEMP_DIR, CLEAN_DIR):
        d.mkdir(parents=True, exist_ok=True)

    print(f"\nScanning folders:")
    print(f"  Rainfall : {RAINFALL_DIR}")
    print(f"  Max Temp : {MAXTEMP_DIR}")
    print(f"  Min Temp : {MINTEMP_DIR}")

    rf_files = find_year_files(RAINFALL_DIR, RAINFALL_PATTERN)
    maxt_files = find_year_files(MAXTEMP_DIR, MAXTEMP_PATTERN)
    mint_files = find_year_files(MINTEMP_DIR, MINTEMP_PATTERN)

    print(f"\nDetected years -- rainfall: {sorted(rf_files)}, "
          f"maxT: {sorted(maxt_files)}, minT: {sorted(mint_files)}")

    # Only years where ALL THREE files exist can be used
    complete_years = sorted(set(rf_files) & set(maxt_files) & set(mint_files))
    missing_partial = (set(rf_files) | set(maxt_files) | set(mint_files)) - set(complete_years)

    if missing_partial:
        print(f"\n[WARNING] These years have only SOME of the 3 files and will be SKIPPED "
              f"until the rest are added: {sorted(missing_partial)}")

    if not complete_years:
        print("\n[STOP] No year has all 3 files (rainfall + maxT + minT) present yet. "
              "Add matching files to raw_data/rainfall, raw_data/maxtemp, raw_data/mintemp.")
        return

    print(f"\nWill build dataset for complete years: {complete_years}\n")

    all_fused = []
    all_dates = []
    common_lats, common_lons = None, None

    for year in complete_years:
        print(f"Processing {year}...")
        result = build_one_year(year, rf_files[year], maxt_files[year], mint_files[year])
        if result is None:
            print(f"  -> skipping {year} due to error above")
            continue
        fused_year, lats, lons = result

        if common_lats is None:
            common_lats, common_lons = lats, lons
        else:
            if not (np.allclose(lats, common_lats) and np.allclose(lons, common_lons)):
                print(f"  [ERROR] {year}: grid coordinates don't match previous years -- skipping")
                continue

        all_fused.append(fused_year)
        all_dates.extend(date_strings_for_year(year))

    if not all_fused:
        print("\n[STOP] No years processed successfully.")
        return

    fused_full = np.concatenate(all_fused, axis=0)
    dates_arr = np.array(all_dates)
    years_used = np.array(complete_years)

    print(f"\nFinal fused dataset shape: {fused_full.shape}  [days, lat, lon, channels]")
    print(f"Date range: {dates_arr[0]} to {dates_arr[-1]}  ({len(dates_arr)} days)")

    # Build output filename: years covered + timestamp, never overwrites old runs
    year_label = f"{complete_years[0]}-{complete_years[-1]}" if len(complete_years) > 1 else f"{complete_years[0]}"
    timestamp = datetime.now().strftime("%Y-%m-%d_%H%M")
    out_name = f"maharashtra_climate_{year_label}_built_{timestamp}.npz"
    out_path = CLEAN_DIR / out_name

    np.savez_compressed(
        out_path,
        fused=fused_full,
        dates=dates_arr,
        lats=common_lats,
        lons=common_lons,
        years_used=years_used,
    )

    print(f"\n[DONE] Saved clean dataset to: {out_path}")
    print(f"       ({out_path.stat().st_size / 1e6:.2f} MB)")
    print(f"\nTo use it for training, load with:")
    print(f"    data = np.load(r'{out_path}')")
    print(f"    fused = data['fused']; dates = data['dates']")


if __name__ == "__main__":
    main()
