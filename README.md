<p align="center">
  <img src="assets/varun-banner.svg" alt="VARUN - Virtual Atmospheric Replica for Understanding and Nowcasting" width="100%" />
</p>

# VARUN - Virtual Atmospheric Replica for Understanding & Nowcasting

[![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![PyTorch](https://img.shields.io/badge/PyTorch-ConvLSTM-EE4C2C?logo=pytorch&logoColor=white)](https://pytorch.org/)
[![React](https://img.shields.io/badge/React-Vite-61DAFB?logo=react&logoColor=111827)](https://vite.dev/)
[![Leaflet](https://img.shields.io/badge/Leaflet-Maps-199900?logo=leaflet&logoColor=white)](https://leafletjs.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**VARUN** is a Maharashtra-pilot climate digital twin prototype for **ISRO Bharatiya Antariksh Hackathon 2026, Problem Statement 5: AI-Powered Digital Twin of India's Climate using India's National Data**.

It currently fuses IMD gridded rainfall, maximum temperature, and minimum temperature into one Maharashtra climate tensor, trains a small GPU-first ConvLSTM one-day forecast model, compares it against transparent baselines, and visualizes the clipped Maharashtra grid in a React + Leaflet dashboard.

This repository is a working partial prototype, not a full national operational climate twin. INSAT/MOSDAC fusion, analog what-if scenarios, and anomaly flagging are planned next layers and are not represented as completed features.

<p align="center">
  <img src="frontend/maharashtra-boundary-clipped-verification.png" alt="Maharashtra clipped grid verification" width="92%" />
</p>

## Snapshot

| Layer | Current state |
| --- | --- |
| National-data foundation | IMD gridded rainfall, max temperature, and min temperature |
| Maharashtra tensor | `(4018, 27, 33, 3)` for complete years 2015-2025 |
| Grid resolution | IMD native 0.25 degree rainfall grid, not ward-level |
| Forecast model | 2-layer ConvLSTM, 10 past days to predict day+1 |
| Evaluation | Persistence and day-of-year climatology baselines |
| Backend API | FastAPI serving 5 endpoints with uvicorn |
| Dashboard | Vite + React + Leaflet map connected to real FastAPI backend |
| Data policy | Raw, clean, and realtime datasets are gitignored and must stay local |

## Verified Results

Training was run on a GPU runtime, not on local CPU. Public-safe artifacts are committed in `outputs/training/run_2026-06-28_181137/`.

| Split | Date range |
| --- | --- |
| Training | 2015-01-01 to 2022-12-31 |
| Validation | 2023-01-01 to 2023-12-31 |
| Held-out test | 2024-01-01 to 2025-12-31 |

| Method | Rainfall RMSE | Rainfall MAE | Max Temp RMSE | Min Temp RMSE |
| --- | ---: | ---: | ---: | ---: |
| ConvLSTM | **9.61 mm** | **3.61 mm** | **1.05 degC** | **0.83 degC** |
| Persistence | 12.47 mm | 4.13 mm | 1.05 degC | 0.88 degC |
| Climatology | 11.53 mm | 4.25 mm | 2.02 degC | 1.84 degC |

These are real metrics from the committed training artifacts, not placeholder proposal numbers.

## What Is Built

- Verified binary parser for IMD rainfall `.grd` and max/min temperature `.GRD` files.
- Maharashtra crop and nearest-neighbour temperature regrid onto the rainfall grid.
- Timestamped dataset builder that processes only complete rainfall + maxT + minT year triplets.
- GPU-first ConvLSTM training and baseline evaluation script.
- Public-safe training result bundle with metrics, training history, comparison figure, and a small checkpoint.
- **FastAPI backend server** (`api_server.py`) serving 5 real data endpoints (climatology, historical dates, nowcast, tomorrow's forecast, and training metrics) with strict error handling.
- **Vite React + Leaflet frontend** connected to the real backend, with full mode switching (climatology, history date scrubber, nowcast, and tomorrow's forecast) and channel switching (Rainfall, Max Temp, Min Temp).
- **Validation metrics chart** rendered dynamically using real metrics from the FastAPI backend.
- Explicit local boundary drawing so the grid does not depend on base-map border styling (450 clipped Maharashtra cells).

## Data Safety

Raw, clean, and realtime climate data are **not committed**.

- IMD raw `.GRD` / `.grd` files stay under `datasets/raw_data/` locally.
- Generated clean `.npz` datasets stay under `datasets/clean_data/` locally.
- Realtime state and prediction `.npz` files stay under `datasets/realtime/` locally.
- CSV exports and full prediction tensors are ignored by default.
- `test_predictions.npz` is intentionally not committed because it contains held-out truth tensors derived from licensed source data.
- `best_model.pt` is committed because it is small, about 277 KB, and contains model weights plus metadata rather than source grids.

Download IMD data directly from official sources before rebuilding locally:

- Rainfall 0.25 degree grid: https://www.imdpune.gov.in/cmpg/Griddata/Rainfall_25_Bin.html
- Maximum temperature 1.0 degree grid: https://imdpune.gov.in/cmpg/Griddata/Max_1_Bin.html
- Minimum temperature 1.0 degree grid: https://imdpune.gov.in/cmpg/Griddata/Min_1_Bin.html

## Project Layout

```text
BAH2026/
├── assets/                                    # README banner and public visual assets
├── datasets/
│   ├── raw_data/{rainfall,maxtemp,mintemp}/   # local only, gitignored except .gitkeep
│   ├── clean_data/                            # local only, gitignored except .gitkeep
│   └── realtime/                              # local only, gitignored except .gitkeep
├── frontend/                                  # Vite React + Leaflet dashboard
│   ├── src/
│   │   ├── components/
│   │   │   ├── ClimateMap.tsx                 # Renders the Leaflet map overlay
│   │   │   ├── DateScrubber.tsx               # Pick historical dates
│   │   │   └── ValidationChart.tsx            # Plot RMSE comparison charts
│   │   ├── api.ts                             # Backend API client
│   │   ├── App.tsx                            # Main dashboard application
│   │   └── grid.ts                            # Grid spatial clipping helper
├── outputs/training/run_2026-06-28_181137/    # public-safe result summary
├── scripts/
│   ├── imd_parser.py
│   └── maharashtra_fusion.py
├── api_server.py                              # FastAPI backend server
├── build_dataset.py
├── fetch_realtime.py                          # Fetch latest realtime data from IMD
├── nowcast.py                                 # Nowcasting report generator
├── predict_latest.py                          # Prediction generator
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

## Run The System

To run the full prototype locally, start both the FastAPI backend and the React dev server:

### 1. Run the Backend API Server

First, install the Python requirements:
```bash
python -m pip install -r requirements.txt
```

Start the FastAPI application with Uvicorn:
```bash
python -m uvicorn api_server:app --host 127.0.0.1 --port 8000
```
The server will run at http://127.0.0.1:8000.

### 2. Run the Frontend Dev Server

In a new terminal window:
```bash
cd frontend
npm install
npm run dev
```
The Vite development server will start, typically at http://localhost:5174/ or http://localhost:5173/ (check terminal output), and requests to `/api` will be proxied to the backend.

## Roadmap

- Add the analog what-if engine using historical nearest-neighbour matching (perturbation sliders).
- Add grid-cell rainfall and heat anomaly flagging from historical percentiles (percentile highlights).
- Integrate INSAT/MOSDAC channels later if access is available.

## Framing Notes

VARUN does not claim ward-level resolution, current flood-risk modeling, or replacement of physics-based numerical weather prediction. It is a data-fusion and decision-support prototype built from national datasets, with careful separation between verified implementation and planned scope.

## Citations

- Pai D.S. et al. (2014), *Development of a new high spatial resolution (0.25 x 0.25) long period daily gridded rainfall data set over India*, MAUSAM, 65(1), pp. 1-18.
- Srivastava A.K., Rajeevan M., Kshirsagar S.R. (2009), *Development of High Resolution Daily Gridded Temperature Data Set for the Indian Region*, Atmospheric Science Letters.

## License

MIT. See [LICENSE](LICENSE).
