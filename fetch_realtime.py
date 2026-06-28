"""Fetch IMD near-real-time grids and build the latest Maharashtra state tensor."""

from __future__ import annotations

import argparse
import shutil
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

try:
    import imdlib as imd
except ImportError as exc:
    raise SystemExit(
        "imdlib is required. Install dependencies with "
        "'python -m pip install -r requirements.txt'."
    ) from exc


ROOT = Path(__file__).resolve().parent
SCRIPTS_DIR = ROOT / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from maharashtra_fusion import MAHARASHTRA_BBOX, crop_to_bbox, regrid_nearest


DEFAULT_OUTPUT = Path("datasets/realtime/maharashtra_latest_state.npz")
DEFAULT_CACHE = Path("datasets/realtime/imdlib_cache")
CHANNELS = ("rainfall", "max_temp", "min_temp")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Download IMD near-real-time rainfall/temperature and build a Maharashtra latest-state tensor."
    )
    parser.add_argument("--days", type=int, default=10, help="Consecutive recent days to fetch.")
    parser.add_argument(
        "--lookback-days",
        type=int,
        default=21,
        help="How far back to search for the latest complete realtime window.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help="Output .npz for the fused latest state.",
    )
    parser.add_argument(
        "--cache-dir",
        type=Path,
        default=DEFAULT_CACHE,
        help="Local cache for imdlib realtime .grd downloads.",
    )
    parser.add_argument(
        "--end-date",
        help="Optional latest date to try first, YYYY-MM-DD. Defaults to today's UTC date.",
    )
    parser.add_argument(
        "--keep-cache",
        action="store_true",
        help="Keep downloaded realtime .grd files in the cache directory.",
    )
    return parser.parse_args()


def validate_args(args: argparse.Namespace) -> None:
    if args.days < 1:
        raise ValueError("--days must be at least 1.")
    if args.lookback_days < args.days:
        raise ValueError("--lookback-days must be greater than or equal to --days.")
    if args.output.suffix.lower() != ".npz":
        raise ValueError("--output must end with .npz.")
    if args.end_date:
        datetime.strptime(args.end_date, "%Y-%m-%d")


def as_date_string(value: datetime) -> str:
    return value.strftime("%Y-%m-%d")


def imd_object_to_lat_lon_time(obj, variable_name: str) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Convert an imdlib IMD object to (time, lat, lon), lat, lon arrays with NaNs preserved."""
    dataset = obj.get_xarray()
    if variable_name not in dataset:
        raise ValueError(f"imdlib object did not contain variable '{variable_name}'.")
    values = dataset[variable_name].values.astype(np.float32)
    if variable_name == "rain":
        values = np.where(values == -999.0, np.nan, values)
    elif variable_name in {"tmax", "tmin"}:
        values = np.where(values == 99.9, np.nan, values)
    lats = dataset["lat"].values.astype(np.float32)
    lons = dataset["lon"].values.astype(np.float32)
    return values, lats, lons


def download_and_open_window(start_date: str, end_date: str, cache_dir: Path):
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_string = cache_dir.as_posix()

    print(f"Trying IMD realtime window: {start_date} to {end_date}")
    print("  Downloading rainfall...")
    imd.get_real_data("rain", start_date, end_date, file_dir=cache_string)
    print("  Downloading maximum temperature...")
    imd.get_real_data("tmax", start_date, end_date, file_dir=cache_string)
    print("  Downloading minimum temperature...")
    imd.get_real_data("tmin", start_date, end_date, file_dir=cache_string)

    # Reopen explicitly through open_real_data so this script uses the reader
    # path documented for imdlib realtime binary grids.
    rain_obj = imd.open_real_data("rain", start_date, end_date, file_dir=cache_string)
    tmax_obj = imd.open_real_data("tmax", start_date, end_date, file_dir=cache_string)
    tmin_obj = imd.open_real_data("tmin", start_date, end_date, file_dir=cache_string)
    return rain_obj, tmax_obj, tmin_obj


def build_realtime_fused_tensor(rain_obj, tmax_obj, tmin_obj):
    rain, rain_lats, rain_lons = imd_object_to_lat_lon_time(rain_obj, "rain")
    tmax, temp_lats, temp_lons = imd_object_to_lat_lon_time(tmax_obj, "tmax")
    tmin, _, _ = imd_object_to_lat_lon_time(tmin_obj, "tmin")

    if not (rain.shape[0] == tmax.shape[0] == tmin.shape[0]):
        raise ValueError(
            f"Realtime variables have different day counts: rain={rain.shape}, "
            f"tmax={tmax.shape}, tmin={tmin.shape}."
        )

    rain_crop, rain_lats_c, rain_lons_c = crop_to_bbox(
        rain, rain_lats, rain_lons, MAHARASHTRA_BBOX
    )
    tmax_crop, temp_lats_c, temp_lons_c = crop_to_bbox(
        tmax, temp_lats, temp_lons, MAHARASHTRA_BBOX
    )
    tmin_crop, _, _ = crop_to_bbox(tmin, temp_lats, temp_lons, MAHARASHTRA_BBOX)

    if tmax_crop.shape[1] == 0 or tmax_crop.shape[2] == 0:
        raise ValueError("Realtime temperature crop is empty for Maharashtra bbox.")

    tmax_regrid = regrid_nearest(
        tmax_crop, temp_lats_c, temp_lons_c, rain_lats_c, rain_lons_c
    )
    tmin_regrid = regrid_nearest(
        tmin_crop, temp_lats_c, temp_lons_c, rain_lats_c, rain_lons_c
    )

    fused = np.stack([rain_crop, tmax_regrid, tmin_regrid], axis=-1).astype(np.float32)
    print(
        "  Realtime grid shapes: "
        f"rain native={rain.shape}, temp native={tmax.shape}, fused={fused.shape}"
    )
    print(
        "  Realtime crop grids: "
        f"rain lat/lon={len(rain_lats_c)}x{len(rain_lons_c)}, "
        f"temp lat/lon={len(temp_lats_c)}x{len(temp_lons_c)}"
    )
    print(
        "  NaN fraction per channel: "
        f"rain={np.isnan(fused[..., 0]).mean():.3f}, "
        f"maxT={np.isnan(fused[..., 1]).mean():.3f}, "
        f"minT={np.isnan(fused[..., 2]).mean():.3f}"
    )
    return fused, rain_lats_c, rain_lons_c


def fetch_latest_complete_window(args: argparse.Namespace):
    first_end = (
        datetime.strptime(args.end_date, "%Y-%m-%d")
        if args.end_date
        else datetime.now(timezone.utc).replace(tzinfo=None)
    )
    errors: list[str] = []

    for offset in range(args.lookback_days - args.days + 1):
        end_day = first_end - timedelta(days=offset)
        start_day = end_day - timedelta(days=args.days - 1)
        start_date = as_date_string(start_day)
        end_date = as_date_string(end_day)
        window_cache = args.cache_dir / f"{start_date}_to_{end_date}"

        if window_cache.exists():
            shutil.rmtree(window_cache)

        try:
            objects = download_and_open_window(start_date, end_date, window_cache)
            return start_date, end_date, window_cache, objects
        except Exception as exc:  # imdlib raises broad exceptions for missing files.
            message = f"{start_date} to {end_date}: {exc}"
            print(f"  Window unavailable: {message}")
            errors.append(message)
            if window_cache.exists():
                shutil.rmtree(window_cache)

    raise RuntimeError(
        "Could not find a complete IMD realtime window. Tried:\n  "
        + "\n  ".join(errors[-8:])
    )


def main() -> int:
    args = parse_args()
    try:
        validate_args(args)
        fetched_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
        start_date, end_date, cache_dir, objects = fetch_latest_complete_window(args)
        fused, lats, lons = build_realtime_fused_tensor(*objects)

        dates = np.array(
            [
                as_date_string(datetime.strptime(start_date, "%Y-%m-%d") + timedelta(days=i))
                for i in range(fused.shape[0])
            ]
        )

        args.output.parent.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(
            args.output,
            fused=fused,
            dates=dates,
            lats=lats,
            lons=lons,
            channels=np.array(CHANNELS),
            fetched_at=fetched_at,
            data_start=start_date,
            data_as_of=end_date,
            source="IMD near-real-time grids via imdlib",
            imdlib_version=getattr(imd, "__version__", "unknown"),
        )

        if not args.keep_cache and cache_dir.exists():
            shutil.rmtree(cache_dir)

        print("\nRealtime Maharashtra state saved.")
        print(f"  Output: {args.output}")
        print(f"  Data as of: {end_date}")
        print(f"  Fetched at: {fetched_at}")
        print(f"  Days included: {len(dates)} ({dates[0]} to {dates[-1]})")
        return 0
    except (ValueError, RuntimeError) as exc:
        print(f"\nERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
