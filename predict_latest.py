"""Predict tomorrow's Maharashtra grid from the latest 10 realtime IMD days."""

from __future__ import annotations

import argparse
import sys
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import torch

from train_model import MaharashtraConvLSTM


DEFAULT_STATE = Path("datasets/realtime/maharashtra_latest_state.npz")
DEFAULT_CHECKPOINT = Path("outputs/training/run_2026-06-28_181137/best_model.pt")
DEFAULT_OUTPUT = Path("datasets/realtime/maharashtra_tomorrow_prediction.npz")
CHANNELS = ("rainfall", "max_temp", "min_temp")
UNITS = ("mm/day", "degC", "degC")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run one-day ConvLSTM inference from the latest realtime Maharashtra state."
    )
    parser.add_argument("--state", type=Path, default=DEFAULT_STATE)
    parser.add_argument("--checkpoint", type=Path, default=DEFAULT_CHECKPOINT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--device", choices=("auto", "cpu", "cuda"), default="auto")
    return parser.parse_args()


def choose_device(requested: str) -> torch.device:
    if requested == "cuda" and not torch.cuda.is_available():
        raise ValueError("CUDA was requested, but it is not available.")
    if requested == "auto":
        return torch.device("cuda" if torch.cuda.is_available() else "cpu")
    return torch.device(requested)


def main() -> int:
    args = parse_args()
    try:
        if not args.state.is_file():
            raise FileNotFoundError(f"Realtime state file not found: {args.state}")
        if not args.checkpoint.is_file():
            raise FileNotFoundError(f"Checkpoint not found: {args.checkpoint}")

        with np.load(args.state, allow_pickle=False) as archive:
            fused = archive["fused"].astype(np.float32)
            dates = archive["dates"].astype(str)
            lats = archive["lats"]
            lons = archive["lons"]
            fetched_at = str(archive["fetched_at"])
            data_as_of = str(archive["data_as_of"])

        if fused.shape[0] < 10:
            raise ValueError(
                f"Need at least 10 realtime days for inference, found {fused.shape[0]}."
            )
        if fused.shape[-1] != 3:
            raise ValueError(f"Expected 3 channels, got fused shape {fused.shape}.")

        device = choose_device(args.device)
        checkpoint = torch.load(args.checkpoint, map_location=device, weights_only=False)
        means = np.asarray(checkpoint["normalization_mean"], dtype=np.float32)
        stds = np.asarray(checkpoint["normalization_std"], dtype=np.float32)

        model = MaharashtraConvLSTM().to(device)
        model.load_state_dict(checkpoint["model_state_dict"])
        model.eval()

        latest_ten = fused[-10:]
        normalized = np.nan_to_num((latest_ten - means) / stds, nan=0.0).astype(np.float32)
        model_input = torch.from_numpy(normalized.transpose(0, 3, 1, 2)).unsqueeze(0).to(device)

        with torch.no_grad():
            normalized_prediction = model(model_input).cpu().numpy()[0].transpose(1, 2, 0)
        prediction = (normalized_prediction * stds + means).astype(np.float32)
        prediction[~np.isfinite(fused[-1])] = np.nan
        prediction[..., 0] = np.where(
            np.isfinite(prediction[..., 0]), np.maximum(prediction[..., 0], 0.0), np.nan
        )

        tomorrow = (
            datetime.strptime(str(dates[-1]), "%Y-%m-%d") + timedelta(days=1)
        ).strftime("%Y-%m-%d")

        args.output.parent.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(
            args.output,
            prediction=prediction,
            prediction_date=tomorrow,
            input_dates=dates[-10:],
            lats=lats,
            lons=lons,
            channels=np.array(CHANNELS),
            checkpoint=str(args.checkpoint),
            data_as_of=data_as_of,
            fetched_at=fetched_at,
        )

        print("Tomorrow Maharashtra grid prediction")
        print(f"  Data as of: {data_as_of}")
        print(f"  Fetched at: {fetched_at}")
        print(f"  Input window: {dates[-10]} to {dates[-1]}")
        print(f"  Prediction date: {tomorrow}")
        print(f"  Device: {device}")
        print(f"  Output: {args.output}")
        for index, (channel, unit) in enumerate(zip(CHANNELS, UNITS)):
            values = prediction[..., index]
            print(
                f"    {channel}: mean={np.nanmean(values):.2f} {unit}, "
                f"min={np.nanmin(values):.2f}, max={np.nanmax(values):.2f}"
            )
        return 0
    except (FileNotFoundError, ValueError, KeyError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
