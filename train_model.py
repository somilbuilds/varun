"""Train and evaluate a small ConvLSTM on the clean Maharashtra climate tensor."""

from __future__ import annotations

import argparse
import csv
import json
import math
import random
import sys
import warnings
from datetime import datetime
from pathlib import Path

import numpy as np

try:
    import torch
    from torch import nn
    from torch.utils.data import DataLoader, Dataset
except ImportError as exc:
    raise SystemExit(
        "PyTorch is required. Install dependencies with "
        "'python -m pip install -r requirements.txt'."
    ) from exc


CHANNELS = ("rainfall", "max_temp", "min_temp")
UNITS = ("mm", "degC", "degC")
DEFAULT_DATA_DIR = Path("datasets/clean_data")
DEFAULT_OUTPUT_DIR = Path("outputs/training")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Train a two-layer ConvLSTM to predict the next day's rainfall, "
            "maximum temperature, and minimum temperature."
        )
    )
    parser.add_argument(
        "--data",
        type=Path,
        help="Clean .npz dataset. Defaults to the newest file in datasets/clean_data/.",
    )
    parser.add_argument("--sequence-length", type=int, default=10)
    parser.add_argument("--train-end", default="2022-12-31")
    parser.add_argument("--validation-end", default="2023-12-31")
    parser.add_argument("--epochs", type=int, default=10)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--learning-rate", type=float, default=1e-3)
    parser.add_argument("--patience", type=int, default=3)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--num-workers", type=int, default=0)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument(
        "--device",
        choices=("cuda", "cpu"),
        default="cuda",
        help="Training device. Defaults to CUDA for Colab/Kaggle GPU runs.",
    )
    return parser.parse_args()


def validate_args(args: argparse.Namespace) -> None:
    if args.sequence_length < 1:
        raise ValueError("--sequence-length must be at least 1.")
    if args.epochs < 1:
        raise ValueError("--epochs must be at least 1.")
    if args.batch_size < 1:
        raise ValueError("--batch-size must be at least 1.")
    if args.learning_rate <= 0:
        raise ValueError("--learning-rate must be positive.")
    if args.patience < 1:
        raise ValueError("--patience must be at least 1.")
    if args.num_workers < 0:
        raise ValueError("--num-workers cannot be negative.")

    train_end = np.datetime64(args.train_end, "D")
    validation_end = np.datetime64(args.validation_end, "D")
    if validation_end <= train_end:
        raise ValueError("--validation-end must be later than --train-end.")


def select_data_file(explicit_path: Path | None) -> Path:
    if explicit_path is not None:
        path = explicit_path
        if not path.is_file():
            raise FileNotFoundError(f"Dataset not found: {path}")
        return path

    candidates = list(DEFAULT_DATA_DIR.glob("*.npz"))
    if not candidates:
        raise FileNotFoundError(
            f"No clean .npz files found in {DEFAULT_DATA_DIR}. Run build_dataset.py first."
        )
    return max(candidates, key=lambda path: path.stat().st_mtime)


def load_and_validate_data(path: Path) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    print(f"Loading clean dataset: {path}")
    with np.load(path) as archive:
        required = {"fused", "dates", "lats", "lons"}
        missing = required.difference(archive.files)
        if missing:
            raise ValueError(f"Dataset is missing required arrays: {sorted(missing)}")
        fused = archive["fused"].astype(np.float32, copy=False)
        date_strings = archive["dates"].astype(str)
        lats = archive["lats"].astype(np.float32, copy=False)
        lons = archive["lons"].astype(np.float32, copy=False)

    if fused.ndim != 4 or fused.shape[-1] != len(CHANNELS):
        raise ValueError(
            "Expected fused shape (days, lat, lon, 3) for "
            f"{CHANNELS}, got {fused.shape}."
        )
    if len(date_strings) != fused.shape[0]:
        raise ValueError(
            f"dates has {len(date_strings)} entries but fused has {fused.shape[0]} days."
        )
    if fused.shape[1:] != (len(lats), len(lons), len(CHANNELS)):
        raise ValueError(
            "Coordinate lengths do not match fused grid: "
            f"fused={fused.shape}, lats={len(lats)}, lons={len(lons)}."
        )

    dates = date_strings.astype("datetime64[D]")
    if len(dates) > 1:
        day_steps = np.diff(dates).astype("timedelta64[D]").astype(int)
        bad_steps = np.flatnonzero(day_steps != 1)
        if bad_steps.size:
            index = int(bad_steps[0])
            raise ValueError(
                "Dates must be strictly consecutive daily observations. "
                f"Found a gap between {date_strings[index]} and {date_strings[index + 1]}."
            )

    for channel_index, channel in enumerate(CHANNELS):
        if not np.isfinite(fused[..., channel_index]).any():
            raise ValueError(f"Channel '{channel}' contains no finite values.")
    reference_valid_mask = np.isfinite(fused[0])
    if not np.all(np.isfinite(fused) == reference_valid_mask):
        raise ValueError(
            "This trainer expects missing cells to be static across all dates. "
            "Intermittent missing values were found; repair or impute them explicitly."
        )

    print(
        f"  Shape: {fused.shape}; date range: {date_strings[0]} to {date_strings[-1]}"
    )
    print(
        "  Static missing cells by channel: "
        + ", ".join(
            f"{channel}={int(np.isnan(fused[..., index]).all(axis=0).sum())}"
            for index, channel in enumerate(CHANNELS)
        )
    )
    return fused, dates, lats, lons


def make_split_indices(
    dates: np.ndarray,
    sequence_length: int,
    train_end: np.datetime64,
    validation_end: np.datetime64,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    target_indices = np.arange(sequence_length, len(dates), dtype=np.int64)
    target_dates = dates[target_indices]
    train = target_indices[target_dates <= train_end]
    validation = target_indices[
        (target_dates > train_end) & (target_dates <= validation_end)
    ]
    test = target_indices[target_dates > validation_end]

    empty = [
        name
        for name, indices in (("training", train), ("validation", validation), ("test", test))
        if len(indices) == 0
    ]
    if empty:
        raise ValueError(
            "Date boundaries produced empty split(s): "
            f"{', '.join(empty)}. Adjust --train-end or --validation-end."
        )
    return train, validation, test


def compute_normalization(
    fused: np.ndarray, dates: np.ndarray, train_end: np.datetime64
) -> tuple[np.ndarray, np.ndarray]:
    training_days = fused[dates <= train_end]
    means = np.nanmean(training_days, axis=(0, 1, 2)).astype(np.float32)
    stds = np.nanstd(training_days, axis=(0, 1, 2)).astype(np.float32)
    if not np.all(np.isfinite(means)) or not np.all(np.isfinite(stds)):
        raise ValueError("Could not compute finite training normalization statistics.")
    if np.any(stds <= 0):
        raise ValueError(f"Training standard deviations must be positive, got {stds}.")
    return means, stds


class ClimateSequenceDataset(Dataset):
    def __init__(
        self,
        normalized_chw: np.ndarray,
        target_indices: np.ndarray,
        sequence_length: int,
    ) -> None:
        self.data = normalized_chw
        self.target_indices = target_indices
        self.sequence_length = sequence_length

    def __len__(self) -> int:
        return len(self.target_indices)

    def __getitem__(self, item: int) -> tuple[torch.Tensor, torch.Tensor]:
        target_index = int(self.target_indices[item])
        sequence = self.data[target_index - self.sequence_length : target_index]
        target = self.data[target_index]
        return torch.from_numpy(sequence), torch.from_numpy(target)


class ConvLSTMCell(nn.Module):
    def __init__(self, input_channels: int, hidden_channels: int, kernel_size: int = 3):
        super().__init__()
        padding = kernel_size // 2
        self.hidden_channels = hidden_channels
        self.gates = nn.Conv2d(
            input_channels + hidden_channels,
            4 * hidden_channels,
            kernel_size=kernel_size,
            padding=padding,
        )

    def forward(
        self,
        inputs: torch.Tensor,
        hidden: torch.Tensor,
        cell: torch.Tensor,
    ) -> tuple[torch.Tensor, torch.Tensor]:
        combined = torch.cat((inputs, hidden), dim=1)
        input_gate, forget_gate, output_gate, candidate = self.gates(combined).chunk(4, dim=1)
        input_gate = torch.sigmoid(input_gate)
        forget_gate = torch.sigmoid(forget_gate)
        output_gate = torch.sigmoid(output_gate)
        candidate = torch.tanh(candidate)
        next_cell = forget_gate * cell + input_gate * candidate
        next_hidden = output_gate * torch.tanh(next_cell)
        return next_hidden, next_cell


class MaharashtraConvLSTM(nn.Module):
    def __init__(self) -> None:
        super().__init__()
        self.layer1 = ConvLSTMCell(input_channels=3, hidden_channels=32, kernel_size=3)
        self.layer2 = ConvLSTMCell(input_channels=32, hidden_channels=16, kernel_size=3)
        self.output_head = nn.Conv2d(16, 3, kernel_size=1)

    def forward(self, sequence: torch.Tensor) -> torch.Tensor:
        batch_size, time_steps, _, height, width = sequence.shape
        hidden1 = sequence.new_zeros((batch_size, 32, height, width))
        cell1 = sequence.new_zeros((batch_size, 32, height, width))
        hidden2 = sequence.new_zeros((batch_size, 16, height, width))
        cell2 = sequence.new_zeros((batch_size, 16, height, width))

        for step in range(time_steps):
            hidden1, cell1 = self.layer1(sequence[:, step], hidden1, cell1)
            hidden2, cell2 = self.layer2(hidden1, hidden2, cell2)
        return self.output_head(hidden2)


def masked_mse(
    prediction: torch.Tensor, target: torch.Tensor, valid_mask: torch.Tensor
) -> torch.Tensor:
    squared_error = (prediction - target).square() * valid_mask
    denominator = valid_mask.sum() * prediction.shape[0]
    return squared_error.sum() / denominator


def run_epoch(
    model: nn.Module,
    loader: DataLoader,
    valid_mask: torch.Tensor,
    device: torch.device,
    optimizer: torch.optim.Optimizer | None = None,
) -> float:
    training = optimizer is not None
    model.train(training)
    total_loss = 0.0
    total_examples = 0

    for sequences, targets in loader:
        sequences = sequences.to(device, non_blocking=True)
        targets = targets.to(device, non_blocking=True)
        if training:
            optimizer.zero_grad(set_to_none=True)

        with torch.set_grad_enabled(training):
            predictions = model(sequences)
            loss = masked_mse(predictions, targets, valid_mask)
            if training:
                loss.backward()
                nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
                optimizer.step()

        batch_size = sequences.shape[0]
        total_loss += float(loss.detach().cpu()) * batch_size
        total_examples += batch_size

    return total_loss / total_examples


def train_model(
    model: nn.Module,
    train_loader: DataLoader,
    validation_loader: DataLoader,
    valid_mask: torch.Tensor,
    device: torch.device,
    epochs: int,
    learning_rate: float,
    patience: int,
) -> tuple[dict[str, torch.Tensor], list[dict[str, float]]]:
    optimizer = torch.optim.Adam(model.parameters(), lr=learning_rate)
    best_state: dict[str, torch.Tensor] | None = None
    best_validation_loss = math.inf
    epochs_without_improvement = 0
    history: list[dict[str, float]] = []

    print("\nTraining ConvLSTM")
    for epoch in range(1, epochs + 1):
        train_loss = run_epoch(model, train_loader, valid_mask, device, optimizer)
        validation_loss = run_epoch(
            model, validation_loader, valid_mask, device, optimizer=None
        )
        history.append(
            {
                "epoch": epoch,
                "train_normalized_mse": train_loss,
                "validation_normalized_mse": validation_loss,
            }
        )
        print(
            f"  Epoch {epoch:02d}/{epochs}: "
            f"train MSE={train_loss:.6f}, validation MSE={validation_loss:.6f}"
        )

        if validation_loss < best_validation_loss - 1e-7:
            best_validation_loss = validation_loss
            best_state = {
                name: tensor.detach().cpu().clone()
                for name, tensor in model.state_dict().items()
            }
            epochs_without_improvement = 0
            print("    New best validation checkpoint.")
        else:
            epochs_without_improvement += 1
            if epochs_without_improvement >= patience:
                print(f"    Early stopping after {patience} non-improving epoch(s).")
                break

    if best_state is None:
        raise RuntimeError("Training did not produce a checkpoint.")
    return best_state, history


def predict_model(
    model: nn.Module,
    loader: DataLoader,
    device: torch.device,
    means: np.ndarray,
    stds: np.ndarray,
) -> np.ndarray:
    model.eval()
    batches: list[np.ndarray] = []
    with torch.no_grad():
        for sequences, _ in loader:
            normalized = model(sequences.to(device, non_blocking=True)).cpu().numpy()
            physical = normalized.transpose(0, 2, 3, 1) * stds + means
            batches.append(physical.astype(np.float32, copy=False))
    return np.concatenate(batches, axis=0)


def build_climatology_predictions(
    fused: np.ndarray,
    dates: np.ndarray,
    train_end: np.datetime64,
    target_indices: np.ndarray,
) -> np.ndarray:
    date_strings = dates.astype(str)
    training_mask = dates <= train_end
    training_keys = np.array([value[5:10] for value in date_strings[training_mask]])
    climatology: dict[str, np.ndarray] = {}

    for key in np.unique(training_keys):
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", category=RuntimeWarning)
            climatology[str(key)] = np.nanmean(
                fused[training_mask][training_keys == key], axis=0
            ).astype(np.float32)

    target_keys = np.array([value[5:10] for value in date_strings[target_indices]])
    missing_keys = sorted({str(key) for key in target_keys if str(key) not in climatology})
    if missing_keys:
        raise ValueError(
            "Training period cannot supply climatology for calendar day(s): "
            + ", ".join(missing_keys)
        )
    return np.stack([climatology[str(key)] for key in target_keys])


def calculate_metrics(
    truth: np.ndarray,
    predictions: dict[str, np.ndarray],
) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for method, predicted in predictions.items():
        if predicted.shape != truth.shape:
            raise ValueError(
                f"Prediction shape mismatch for {method}: {predicted.shape} vs {truth.shape}."
            )
        for channel_index, (channel, unit) in enumerate(zip(CHANNELS, UNITS)):
            actual_channel = truth[..., channel_index]
            predicted_channel = predicted[..., channel_index]
            valid = np.isfinite(actual_channel) & np.isfinite(predicted_channel)
            errors = predicted_channel[valid] - actual_channel[valid]
            rows.append(
                {
                    "method": method,
                    "channel": channel,
                    "unit": unit,
                    "rmse": float(np.sqrt(np.mean(np.square(errors), dtype=np.float64))),
                    "mae": float(np.mean(np.abs(errors), dtype=np.float64)),
                    "valid_values": int(valid.sum()),
                }
            )
    return rows


def print_metrics(rows: list[dict[str, object]]) -> None:
    print("\nHeld-out test metrics")
    print("  Method       Channel       RMSE       MAE   Unit")
    print("  ------------ ------------- ---------- ---------- -----")
    for row in rows:
        print(
            f"  {str(row['method']):<12} {str(row['channel']):<13} "
            f"{float(row['rmse']):>10.4f} {float(row['mae']):>10.4f} "
            f"{row['unit']}"
        )


def save_history(path: Path, history: list[dict[str, float]]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(history[0].keys()))
        writer.writeheader()
        writer.writerows(history)


def save_metrics_csv(path: Path, rows: list[dict[str, object]]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def save_comparison_figure(path: Path, rows: list[dict[str, object]]) -> None:
    try:
        import matplotlib.pyplot as plt
    except ImportError as exc:
        raise RuntimeError(
            "matplotlib is required to save the comparison figure. "
            "Install dependencies from requirements.txt."
        ) from exc

    methods = ("convlstm", "persistence", "climatology")
    colors = ("#176b87", "#d97706", "#64748b")
    figure, axes = plt.subplots(2, 3, figsize=(12, 6.5), constrained_layout=True)

    for column, (channel, unit) in enumerate(zip(CHANNELS, UNITS)):
        channel_rows = {
            str(row["method"]): row for row in rows if row["channel"] == channel
        }
        for row_index, metric in enumerate(("rmse", "mae")):
            values = [float(channel_rows[method][metric]) for method in methods]
            axis = axes[row_index, column]
            bars = axis.bar(methods, values, color=colors)
            axis.set_title(f"{channel.replace('_', ' ').title()} {metric.upper()}")
            axis.set_ylabel(unit)
            axis.tick_params(axis="x", rotation=20)
            axis.grid(axis="y", alpha=0.25)
            for bar, value in zip(bars, values):
                axis.text(
                    bar.get_x() + bar.get_width() / 2,
                    bar.get_height(),
                    f"{value:.2f}",
                    ha="center",
                    va="bottom",
                    fontsize=8,
                )

    figure.suptitle("Held-out 2024-2025 one-day forecast comparison", fontsize=14)
    figure.savefig(path, dpi=180)
    plt.close(figure)


def choose_device(requested: str) -> torch.device:
    if requested == "cuda" and not torch.cuda.is_available():
        raise ValueError(
            "CUDA is not available. Run training in Google Colab or Kaggle with a GPU "
            "runtime, or pass --device cpu only for tiny smoke tests."
        )
    return torch.device(requested)


def set_reproducible_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def main() -> int:
    args = parse_args()
    try:
        validate_args(args)
        set_reproducible_seed(args.seed)
        data_path = select_data_file(args.data)
        fused, dates, lats, lons = load_and_validate_data(data_path)

        train_end = np.datetime64(args.train_end, "D")
        validation_end = np.datetime64(args.validation_end, "D")
        train_indices, validation_indices, test_indices = make_split_indices(
            dates, args.sequence_length, train_end, validation_end
        )
        print(
            "  Sequence targets: "
            f"train={len(train_indices)}, validation={len(validation_indices)}, "
            f"test={len(test_indices)}"
        )

        means, stds = compute_normalization(fused, dates, train_end)
        print(
            "  Training normalization: "
            + ", ".join(
                f"{channel} mean={means[index]:.3f}, std={stds[index]:.3f}"
                for index, channel in enumerate(CHANNELS)
            )
        )

        normalized = (fused - means) / stds
        normalized = np.nan_to_num(normalized, nan=0.0).astype(np.float32, copy=False)
        normalized_chw = np.ascontiguousarray(normalized.transpose(0, 3, 1, 2))
        valid_mask_np = np.isfinite(fused[0]).transpose(2, 0, 1).astype(np.float32)

        train_dataset = ClimateSequenceDataset(
            normalized_chw, train_indices, args.sequence_length
        )
        validation_dataset = ClimateSequenceDataset(
            normalized_chw, validation_indices, args.sequence_length
        )
        test_dataset = ClimateSequenceDataset(
            normalized_chw, test_indices, args.sequence_length
        )

        device = choose_device(args.device)
        pin_memory = device.type == "cuda"
        loader_options = {
            "batch_size": args.batch_size,
            "num_workers": args.num_workers,
            "pin_memory": pin_memory,
        }
        train_loader = DataLoader(train_dataset, shuffle=True, **loader_options)
        validation_loader = DataLoader(
            validation_dataset, shuffle=False, **loader_options
        )
        test_loader = DataLoader(test_dataset, shuffle=False, **loader_options)

        model = MaharashtraConvLSTM().to(device)
        parameter_count = sum(parameter.numel() for parameter in model.parameters())
        print(f"  Device: {device}; trainable parameters: {parameter_count:,}")
        valid_mask = torch.from_numpy(valid_mask_np).unsqueeze(0).to(device)

        best_state, history = train_model(
            model=model,
            train_loader=train_loader,
            validation_loader=validation_loader,
            valid_mask=valid_mask,
            device=device,
            epochs=args.epochs,
            learning_rate=args.learning_rate,
            patience=args.patience,
        )
        model.load_state_dict(best_state)

        print("\nGenerating held-out predictions and baselines...")
        model_predictions = predict_model(model, test_loader, device, means, stds)
        truth = fused[test_indices]
        persistence_predictions = fused[test_indices - 1]
        climatology_predictions = build_climatology_predictions(
            fused, dates, train_end, test_indices
        )
        predictions = {
            "convlstm": model_predictions,
            "persistence": persistence_predictions,
            "climatology": climatology_predictions,
        }
        metric_rows = calculate_metrics(truth, predictions)
        print_metrics(metric_rows)

        run_stamp = datetime.now().strftime("%Y-%m-%d_%H%M%S")
        run_dir = args.output_dir / f"run_{run_stamp}"
        run_dir.mkdir(parents=True, exist_ok=False)

        checkpoint = {
            "model_state_dict": best_state,
            "model_name": "MaharashtraConvLSTM",
            "input_channels": 3,
            "hidden_channels": [32, 16],
            "kernel_size": 3,
            "sequence_length": args.sequence_length,
            "channel_names": CHANNELS,
            "channel_units": UNITS,
            "normalization_mean": means,
            "normalization_std": stds,
            "lats": lats,
            "lons": lons,
            "data_file": str(data_path),
        }
        torch.save(checkpoint, run_dir / "best_model.pt")
        save_history(run_dir / "training_history.csv", history)
        save_metrics_csv(run_dir / "test_metrics.csv", metric_rows)

        metrics_document = {
            "created_at": datetime.now().isoformat(timespec="seconds"),
            "data_file": str(data_path),
            "data_shape": list(fused.shape),
            "date_range": [str(dates[0]), str(dates[-1])],
            "split": {
                "train_end": args.train_end,
                "validation_end": args.validation_end,
                "test_start": str(dates[test_indices[0]]),
                "test_end": str(dates[test_indices[-1]]),
                "train_targets": len(train_indices),
                "validation_targets": len(validation_indices),
                "test_targets": len(test_indices),
            },
            "training": {
                "epochs_requested": args.epochs,
                "epochs_completed": len(history),
                "batch_size": args.batch_size,
                "learning_rate": args.learning_rate,
                "patience": args.patience,
                "seed": args.seed,
                "device": str(device),
                "parameter_count": parameter_count,
            },
            "metrics": metric_rows,
        }
        (run_dir / "metrics.json").write_text(
            json.dumps(metrics_document, indent=2), encoding="utf-8"
        )
        np.savez_compressed(
            run_dir / "test_predictions.npz",
            dates=dates[test_indices].astype(str),
            truth=truth,
            convlstm=model_predictions,
            persistence=persistence_predictions,
            climatology=climatology_predictions,
            lats=lats,
            lons=lons,
        )
        save_comparison_figure(run_dir / "test_metrics_comparison.png", metric_rows)

        print(f"\nTraining complete. Artifacts saved to: {run_dir}")
        return 0
    except (FileNotFoundError, ValueError, RuntimeError) as exc:
        print(f"\nERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())


