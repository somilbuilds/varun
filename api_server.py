"""
FastAPI backend for VARUN — Maharashtra Climate Digital Twin.

Serves real IMD data from local .npz files and the trained ConvLSTM metrics.
NEVER falls back to fake/placeholder data — errors loudly if files are missing.

Run from the repo root:
    uvicorn api_server:app --reload --port 8000

All endpoints return JSON. The frontend Vite dev server proxies /api -> :8000.
"""

from __future__ import annotations

import json
import sys
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# ---------------------------------------------------------------------------
# File paths (relative to repo root, where uvicorn is launched from)
# ---------------------------------------------------------------------------
CLEAN_DATA_DIR = Path("datasets/clean_data")
REALTIME_STATE = Path("datasets/realtime/maharashtra_latest_state.npz")
REALTIME_PREDICTION = Path("datasets/realtime/maharashtra_tomorrow_prediction.npz")
METRICS_JSON = Path("outputs/training/run_2026-06-28_181137/metrics.json")

# Maharashtra 0.25-degree grid constants (from context.md §4)
LAT_SOUTH = 15.5
LAT_NORTH = 22.0
LON_WEST = 72.5
LON_EAST = 80.5
GRID_ROWS = 27
GRID_COLS = 33

# Channel order in .npz fused tensors
CHANNELS = ["rainfall", "max_temp", "min_temp"]
CHANNEL_UNITS = {"rainfall": "mm/day", "max_temp": "degC", "min_temp": "degC"}


# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------
app = FastAPI(
    title="VARUN Climate API",
    description="Serves real IMD Maharashtra climate grid data to the VARUN frontend.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # dev convenience; tighten for production
    allow_methods=["GET"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _find_clean_dataset() -> Path:
    """Return the .npz in clean_data with the most days (i.e. widest coverage)."""
    candidates = list(CLEAN_DATA_DIR.glob("maharashtra_climate_*.npz"))
    if not candidates:
        raise FileNotFoundError(
            f"No clean dataset .npz found in {CLEAN_DATA_DIR}. "
            "Run build_dataset.py first."
        )
    # Sort by file size as a proxy for day count; largest = most complete
    return max(candidates, key=lambda p: p.stat().st_size)


def _load_clean_dataset() -> tuple[np.ndarray, list[str], dict[str, int]]:
    """Load (data, dates, date_index) from the clean dataset. Cached at module level."""
    if _ds_cache:
        return _ds_cache["data"], _ds_cache["dates"], _ds_cache["date_index"]
    path = _find_clean_dataset()
    print(f"[api_server] Loading clean dataset: {path}", flush=True)
    with np.load(path, allow_pickle=False) as archive:
        data = archive["fused"]
        dates = archive["dates"].astype(str).tolist()
    date_index = {day: idx for idx, day in enumerate(dates)}
    _ds_cache["data"] = data
    _ds_cache["dates"] = dates
    _ds_cache["date_index"] = date_index
    print(f"[api_server] Loaded {len(dates)} days, shape {data.shape}", flush=True)
    return data, dates, date_index


# Module-level cache: dataset arrays, date list, O(1) date lookup, precomputed climatology
_ds_cache: dict[str, Any] = {}
_climatology_payload: dict[str, Any] | None = None


def _grid_to_payload(
    grid: np.ndarray,  # shape (27, 33, C) or (27, 33) for single channel
    channel_index: int = 0,
) -> dict:
    """
    Convert a 2-D grid slice (27x33) to the API payload format expected by the
    frontend:
      {
        "bbox": {south, north, west, east},
        "gridShape": {rows, cols},
        "values": {"rainfall": [[...], ...]}   <- row-major, NaN -> null
      }
    Returns the single-channel rainfall slice.
    """
    if grid.ndim == 3:
        arr = grid[..., channel_index]   # (27, 33)
    else:
        arr = grid

    # Replace NaN with None for JSON serialisation
    rows_list = []
    for r in range(arr.shape[0]):
        row = []
        for c in range(arr.shape[1]):
            v = float(arr[r, c])
            row.append(None if not np.isfinite(v) else round(v, 3))
        rows_list.append(row)

    return {
        "bbox": {
            "south": LAT_SOUTH,
            "north": LAT_NORTH,
            "west": LON_WEST,
            "east": LON_EAST,
        },
        "gridShape": {"rows": GRID_ROWS, "cols": GRID_COLS},
        "channel": CHANNELS[channel_index],
        "unit": CHANNEL_UNITS[CHANNELS[channel_index]],
        "values": rows_list,
    }


def _values_dict_from_grid(grid: np.ndarray) -> dict[str, list]:
    """Convert a (27, 33, 3) grid slice to JSON-safe channel value matrices."""
    values: dict[str, list] = {}
    for i, ch in enumerate(CHANNELS):
        arr = grid[..., i] if grid.ndim == 3 else grid
        rows_list = []
        for r in range(arr.shape[0]):
            row = []
            for c in range(arr.shape[1]):
                v = float(arr[r, c])
                row.append(None if not np.isfinite(v) else round(v, 3))
            rows_list.append(row)
        values[ch] = rows_list
    return values


def _daily_frames_from_fused(fused: np.ndarray, dates: list[str]) -> list[dict]:
    """Build timeline frames for the frontend slider (one frame per day)."""
    frames = []
    for i, day in enumerate(dates):
        frames.append({
            "date": day,
            "frame_type": "observed",
            "values": _values_dict_from_grid(fused[i]),
        })
    return frames


def _all_channels_payload(grid: np.ndarray) -> dict[str, Any]:
    """Return all 3 channels in one go, keyed by channel name."""
    out: dict[str, Any] = {
        "bbox": {
            "south": LAT_SOUTH,
            "north": LAT_NORTH,
            "west": LON_WEST,
            "east": LON_EAST,
        },
        "gridShape": {"rows": GRID_ROWS, "cols": GRID_COLS},
        "values": {},
        "units": CHANNEL_UNITS,
    }
    out["values"] = _values_dict_from_grid(grid)
    return out


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health() -> dict:
    """Quick liveness check."""
    return {"status": "ok", "server": "VARUN Climate API"}


@app.get("/api/historical/climatology")
def historical_climatology() -> dict:
    """
    Return the per-cell mean across all dates in the clean dataset.
    This is the plain temporal mean — used as the map default view.
    IMPORTANT: this route must be registered BEFORE /historical/{date_str}
    so FastAPI doesn't swallow 'climatology' as a date parameter.
    """
    global _climatology_payload
    if _climatology_payload is not None:
        return _climatology_payload

    data, dates, _ = _load_clean_dataset()
    mean_grid = np.nanmean(data, axis=0)

    payload = _all_channels_payload(mean_grid)
    payload["type"] = "climatology"
    payload["date_range"] = [dates[0], dates[-1]]
    payload["n_days"] = len(dates)
    payload["description"] = (
        f"Per-cell temporal mean over {len(dates)} days "
        f"({dates[0]} to {dates[-1]})"
    )
    _climatology_payload = payload
    return payload


@app.get("/api/historical/{date_str}")
def historical_date(date_str: str) -> dict:
    """
    Return the real historical fused grid for a given date (YYYY-MM-DD).
    Raises 404 if the date is outside the clean dataset range.
    """
    # Validate format
    try:
        datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid date format: {date_str!r}. Use YYYY-MM-DD.")

    data, dates, date_index = _load_clean_dataset()

    idx = date_index.get(date_str)
    if idx is None:
        raise HTTPException(
            status_code=404,
            detail=f"Date {date_str} not found in dataset. "
                   f"Available range: {dates[0]} to {dates[-1]}.",
        )

    grid = data[idx]

    payload = _all_channels_payload(grid)
    payload["date"] = date_str
    payload["type"] = "historical"
    return payload


@app.get("/api/nowcast")
def nowcast() -> dict:
    """
    Return the latest real-time Maharashtra state from datasets/realtime/.
    Includes data_as_of (the actual IMD data date, never hidden).
    Errors loudly if the realtime file is missing — run fetch_realtime.py first.
    """
    if not REALTIME_STATE.is_file():
        raise HTTPException(
            status_code=503,
            detail=(
                "Realtime state file not found. "
                "Run fetch_realtime.py to download the latest IMD data."
            ),
        )

    with np.load(REALTIME_STATE, allow_pickle=False) as archive:
        fused = archive["fused"]          # (10, 27, 33, 3)
        dates = archive["dates"].astype(str).tolist()
        fetched_at = str(archive["fetched_at"])
        data_as_of = str(archive["data_as_of"])
        source = str(archive["source"])

    latest_grid = fused[-1]   # most recent day: (27, 33, 3)

    payload = _all_channels_payload(latest_grid)
    payload["type"] = "nowcast"
    payload["data_as_of"] = data_as_of
    payload["fetched_at"] = fetched_at
    payload["source"] = source
    payload["window_dates"] = dates
    payload["daily_frames"] = _daily_frames_from_fused(fused, dates)
    payload["timeline_resolution"] = "daily"
    payload["lag_note"] = (
        "IMD near-real-time data typically has a 1-day lag. "
        "'data_as_of' reflects the actual latest date available from IMD, "
        "not the current calendar date."
    )
    return payload


@app.get("/api/forecast/tomorrow")
def forecast_tomorrow() -> dict:
    """
    Return the ConvLSTM one-day-ahead prediction from datasets/realtime/.
    Errors loudly if the prediction file is missing — run predict_latest.py first.
    """
    if not REALTIME_PREDICTION.is_file():
        raise HTTPException(
            status_code=503,
            detail=(
                "Tomorrow's prediction file not found. "
                "Run predict_latest.py to generate the forecast."
            ),
        )

    with np.load(REALTIME_PREDICTION, allow_pickle=False) as archive:
        prediction = archive["prediction"]                    # (27, 33, 3)
        prediction_date = str(archive["prediction_date"])
        input_dates = archive["input_dates"].astype(str).tolist()
        data_as_of = str(archive["data_as_of"])
        fetched_at = str(archive["fetched_at"])
        checkpoint = str(archive["checkpoint"])

    observed_grid = None
    if REALTIME_STATE.is_file():
        with np.load(REALTIME_STATE, allow_pickle=False) as state:
            observed_grid = state["fused"][-1]

    payload = _all_channels_payload(prediction)
    payload["type"] = "forecast"
    payload["prediction_date"] = prediction_date
    payload["input_window"] = {"start": input_dates[0], "end": input_dates[-1]}
    payload["data_as_of"] = data_as_of
    payload["fetched_at"] = fetched_at
    payload["model"] = "ConvLSTM (2-layer, 32+16 filters, 3×3 kernel)"
    payload["checkpoint"] = checkpoint
    payload["timeline_resolution"] = "daily"
    frames = []
    if observed_grid is not None:
        frames.append({
            "date": data_as_of,
            "frame_type": "observed",
            "values": _values_dict_from_grid(observed_grid),
        })
    frames.append({
        "date": prediction_date,
        "frame_type": "forecast",
        "values": _values_dict_from_grid(prediction),
    })
    payload["daily_frames"] = frames
    payload["disclaimer"] = (
        "This is a short-range AI prediction, NOT a physics-based numerical "
        "weather forecast. It is intended as a research/demo tool only."
    )
    return payload


@app.get("/api/validation-metrics")
def validation_metrics() -> dict:
    """
    Return the real validation metrics from the latest training run.
    Content is read directly from metrics.json — never invented.
    """
    if not METRICS_JSON.is_file():
        raise HTTPException(
            status_code=503,
            detail=f"Metrics file not found at {METRICS_JSON}. "
                   "The training checkpoint must be present.",
        )

    with open(METRICS_JSON, "r", encoding="utf-8") as fh:
        metrics = json.load(fh)

    return metrics


# ---------------------------------------------------------------------------
# Dev-mode entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api_server:app", host="0.0.0.0", port=8000, reload=True)
