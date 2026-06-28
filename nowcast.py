"""Report the current Maharashtra climate state from the realtime fused tensor."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np


DEFAULT_STATE = Path("datasets/realtime/maharashtra_latest_state.npz")
CHANNELS = (
    ("rainfall", "mm/day"),
    ("max_temp", "degC"),
    ("min_temp", "degC"),
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Print the latest observed Maharashtra climate state from realtime IMD data."
    )
    parser.add_argument("--state", type=Path, default=DEFAULT_STATE)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.state.is_file():
        print(
            f"ERROR: realtime state file not found: {args.state}\n"
            "Run fetch_realtime.py first.",
            file=sys.stderr,
        )
        return 1

    with np.load(args.state, allow_pickle=False) as archive:
        fused = archive["fused"]
        dates = archive["dates"].astype(str)
        fetched_at = str(archive["fetched_at"])
        data_as_of = str(archive["data_as_of"])
        source = str(archive["source"])

    latest = fused[-1]
    print("Current Maharashtra climate state")
    print(f"  Source: {source}")
    print(f"  Data as of: {data_as_of}")
    print(f"  Fetched at: {fetched_at}")
    print(f"  File covers: {dates[0]} to {dates[-1]} ({len(dates)} days)")
    print("  Latest grid summary:")
    for index, (channel, unit) in enumerate(CHANNELS):
        values = latest[..., index]
        print(
            f"    {channel}: mean={np.nanmean(values):.2f} {unit}, "
            f"min={np.nanmin(values):.2f}, max={np.nanmax(values):.2f}, "
            f"valid cells={np.isfinite(values).sum()}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
