# Maharashtra Climate Digital Twin

[![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![PyTorch](https://img.shields.io/badge/PyTorch-ConvLSTM-EE4C2C?logo=pytorch&logoColor=white)](https://pytorch.org/)
[![React](https://img.shields.io/badge/React-Vite-61DAFB?logo=react&logoColor=111827)](https://vite.dev/)
[![Leaflet](https://img.shields.io/badge/Leaflet-Maps-199900?logo=leaflet&logoColor=white)](https://leafletjs.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

A Maharashtra-pilot climate digital twin prototype for **ISRO Bharatiya Antariksh Hackathon 2026, Problem Statement 5: AI-Powered Digital Twin of India's Climate using India's National Data**.

The prototype currently fuses IMD gridded rainfall, maximum temperature, and minimum temperature into one Maharashtra climate tensor, trains a small ConvLSTM one-day forecast model on GPU, compares it against simple baselines, and visualizes the Maharashtra grid in a React + Leaflet dashboard.

This is a working partial prototype, not a full national operational climate twin. INSAT/MOSDAC fusion, analog what-if scenarios, and anomaly flagging are designed next steps.

![Maharashtra clipped grid verification](frontend/maharashtra-boundary-clipped-verification.png)

## What Is Built

| Area | Current status |
| --- | --- |
| IMD parsing | Verified binary readers for rainfall `.grd` and max/min temperature `.GRD` files |
| Maharashtra fusion | Crop + nearest-neighbour regrid to a `(days, 27, 33, 3)` tensor |
| Clean dataset pipeline | Timestamped `.npz` builder for all complete year triplets |
| Forecast model | 2-layer ConvLSTM, 10 past days to predict next day |
| Baselines | Persistence and day-of-year climatology |
| Frontend | Vite + React + Leaflet dashboard with clipped Maharashtra grid overlay |
| Boundary handling | Local Maharashtra GeoJSON outline drawn explicitly over the grid |

## Verified Results

Training was run on a GPU runtime, not on local CPU. The committed public-safe result bundle is in `outputs/training/run_2026-06-28_181137/`.

Held-out test period: **2024-01-01 to 2025-12-31**  
Training period: **2015-01-01 to 2022-12-31**  
Validation period: **2023-01-01 to 2023-12-31**

| Method | Rainfall RMSE | Max Temp RMSE | Min Temp RMSE |
| --- | ---: | ---: | ---: |
| ConvLSTM | **9.61 mm** | **1.05 degC** | **0.83 degC** |
| Persistence | 12.47 mm | 1.05 degC | 0.88 degC |
| Climatology | 11.53 mm | 2.02 degC | 1.84 degC |

These are real metrics from the committed run artifacts, not placeholder slide numbers.

## Data Safety

Raw and clean climate data are **not committed**.

- IMD raw `.GRD` / `.grd` files stay under `datasets/raw_data/` locally.
- Generated clean `.npz` datasets stay under `datasets/clean_data/` locally.
- CSV exports and full prediction tensors are ignored by default.
- `test_predictions.npz` is intentionally not committed because it contains held-out truth tensors derived from licensed source data.
- The committed checkpoint is small (`best_model.pt`, about 277 KB) and contains model weights plus metadata, not raw source grids.

Download IMD data directly from official sources before rebuilding locally:

- Rainfall 0.25 degree grid: https://www.imdpune.gov.in/cmpg/Griddata/Rainfall_25_Bin.html
- Maximum temperature 1.0 degree grid: https://imdpune.gov.in/cmpg/Griddata/Max_1_Bin.html
- Minimum temperature 1.0 degree grid: https://www.imdpune.gov.in/cmpg/Griddata/Min_1_Bin.html

## Project Layout

```text
BAH2026/
├── datasets/
│   ├── raw_data/{rainfall,maxtemp,mintemp}/   # local only, gitignored
│   └── clean_data/                            # local only, gitignored
├── frontend/                                  # Vite React + Leaflet dashboard
├── outputs/training/run_2026-06-28_181137/    # public-safe result summary
├── scripts/
│   ├── imd_parser.py
│   └── maharashtra_fusion.py
├── build_dataset.py
├── npz_to_csv.py
├── train_model.py
├── requirements.txt
└── context.md
```

## Rebuild The Dataset

```bash
python -m pip install -r requirements.txt
python build_dataset.py
```

The builder scans the three raw-data folders, processes only years where rainfall, max temperature, and min temperature are all present, then writes a timestamped clean `.npz` without overwriting earlier runs.

Current verified clean tensor shape after adding 2015-2025 data: `(4018, 27, 33, 3)`.

## Train The Model

Use Google Colab or Kaggle with a GPU runtime. The script defaults to CUDA and fails clearly if CUDA is unavailable.

```bash
python train_model.py --epochs 10 --batch-size 32
```

For tiny local syntax or smoke checks only, pass `--device cpu` deliberately. Do not run full training on a local CPU machine.

The script saves:

- `best_model.pt`
- `metrics.json`
- `test_metrics.csv`
- `training_history.csv`
- `test_metrics_comparison.png`
- local-only `test_predictions.npz` unless you keep the default ignore policy

## Run The Frontend

```bash
cd frontend
npm install
npm run dev
```

The dashboard uses Leaflet + OpenStreetMap tiles and does not require an API key, payment card, or backend service.

Current frontend scope:

- Maharashtra map centered on the IMD grid region
- 27 x 33 placeholder grid contract
- Grid clipped to the real Maharashtra boundary by cell center point
- 450 rendered cells after clipping, down from the rectangular 891 cells
- Explicit local boundary outline drawn above the grid
- Reserved panels for future what-if controls, forecast output, and anomaly flags

## What Is Next

- Add the analog what-if engine using historical nearest-neighbour matching.
- Add grid-cell rainfall and heat anomaly flagging from historical percentiles.
- Connect real model outputs into the frontend forecast panel.
- Integrate INSAT/MOSDAC channels later if access is available.

## Framing Notes

This project does not claim ward-level resolution, current flood-risk modeling, or replacement of physics-based numerical weather prediction. It is a data-fusion and decision-support prototype built from national datasets, with careful separation between verified implementation and planned scope.

## Citations

- Pai D.S. et al. (2014), *Development of a new high spatial resolution (0.25 x 0.25) long period daily gridded rainfall data set over India*, MAUSAM, 65(1), pp. 1-18.
- Srivastava A.K., Rajeevan M., Kshirsagar S.R. (2009), *Development of High Resolution Daily Gridded Temperature Data Set for the Indian Region*, Atmospheric Science Letters.

## License

MIT. See [LICENSE](LICENSE).
