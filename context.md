# PROJECT CONTEXT — Maharashtra Climate Digital Twin (ISRO BAH 2026, PS-5)

This file exists so any AI coding assistant (Codex, Claude, Copilot, etc.)
can pick up this project without needing the full chat history re-explained.
Read this fully before writing or changing any code.

---

## 1. What this project actually is

A hackathon submission for **ISRO Bharatiya Antariksh Hackathon 2026**,
**Problem Statement 5: "AI-Powered Digital Twin of India's Climate using
India's National Data."**

Current phase: **Idea Submission (Round 1)** — a PPT proposal only, no
working product required by the organizers. We are voluntarily building a
**real, working partial prototype** anyway, to strengthen the submission
and prepare for a possible later build round.

Round 1 deadline: **July 1, 2026, 11:59 PM IST.**

## 2. The core idea (locked, do not redefine)

> A Maharashtra-pilot, India-scalable AI digital twin that fuses IMD ground
> observations with INSAT satellite data into one climate state, predicts
> rainfall/temperature short-term, and lets a user run "what-if" scenarios
> with explainable, analog-based outputs.

Three pillars, in order of what's actually been built vs. only proposed:

1. **Data fusion** (IMD + INSAT into one Maharashtra-grid tensor) — **partially
   built and verified on real data**, INSAT not yet integrated (see §5).
2. **Short-term ConvLSTM prediction** (rainfall + temp, one-day-ahead demo) —
   **built and evaluated on real held-out data** (see §5).
3. **What-if scenario engine** (historical-analog matching, NOT a physics
   simulation) — **not yet built**, conceptually designed only.

A fourth, smaller differentiator was added on top of the PS requirements:
**grid-cell-level rainfall/heat anomaly flagging** — comparing forecast or
scenario outputs against historical percentiles per grid cell. This is
explicitly NOT called "ward-level" or "flood risk" anywhere — see §6 for
why, this is a hard constraint, not a style choice.

## 3. Hard constraints — do not violate these

- **No ward-level claims.** The Maharashtra crop uses IMD's native 0.25°
  rainfall grid, so each cell is still roughly tens of km across. Expanding
  from the earlier city pilot to Maharashtra increases total cell count only;
  it does not improve per-cell resolution. Use "grid-cell-level" or
  "zone-level" only.
- **No "flood risk" claims without caveat.** Rainfall anomaly is NOT the
  same as flood risk (which needs elevation/drainage data we don't have).
  The honest label is "rainfall/heat anomaly flagging." Flood risk can be
  mentioned only as an explicit future-scope item, never as a current
  capability.
- **No fabricated results.** Any validation numbers (RMSE, MAE, accuracy
  %) must come from an actual run on real data. Never fill in placeholder
  numbers that look real. If a number isn't computed yet, leave it
  explicitly marked as TBD/placeholder, never invent a plausible-looking one.
- **Free tools only.** No paid APIs, no paid compute. Training is designed
  to run on a free-tier Colab/Kaggle GPU (T4) in under an hour — the model
  is intentionally small (small grid, few channels, 2-layer ConvLSTM).
- **No LLM / no API keys needed anywhere in the core pipeline.** This is a
  classical ML (ConvLSTM + simple baselines) project, not an LLM
  application. Don't introduce an LLM dependency unless explicitly asked.
- **Don't claim Pangu-Weather-style NWP replacement.** This project is
  explicitly NOT trying to replace physics-based numerical weather
  prediction. It's a digital twin / decision-support layer on top of
  existing IMD/INSAT data. Keep this framing in any generated text.

## 4. Real, verified facts about the data (do not re-derive or guess these)

### IMD Gridded Rainfall
- Source: https://www.imdpune.gov.in/cmpg/Griddata/Rainfall_25_Bin.html
  (no login required, confirmed reachable)
- Format: binary, direct-access, unformatted, float32, little-endian
- Grid: 135 (lon) x 129 (lat) points, resolution 0.25° x 0.25°
- Lon range: 66.5°E to 100.0°E (step 0.25); Lat range: 6.5°N to 38.5°N (step 0.25)
- One file per year, 365 or 366 daily records (leap years per standard rule)
- Missing value flag: **-999.0**
- Record layout confirmed from real files: reshape as (days, lat=129, lon=135)
- VERIFIED on real 2025 file: exact size match, 365 days, no remainder.
- Maharashtra scope change: the project deliberately expanded from the
  earlier city pilot to a Maharashtra-wide pilot to get more total grid
  cells and broader state coverage. This is **NOT a resolution fix**; the
  underlying per-cell IMD rainfall resolution remains 0.25° x 0.25°
  (roughly ~28 km x ~26 km per cell), so the same no-ward-level and
  no-current-flood-risk honesty constraints still apply.
- Maharashtra bbox used by code: **15.5-22.0N, 72.5-80.5E**.
- Maharashtra rainfall crop on the native 0.25° grid = **27 lat x 33 lon =
  891 cells**. Coordinate range actually selected: lat 15.5N to 22.0N,
  lon 72.5E to 80.5E.

### IMD Gridded Temperature (Max/Min)
- Source (max): https://imdpune.gov.in/cmpg/Griddata/Max_1_Bin.html
- Source (min): https://www.imdpune.gov.in/cmpg/Griddata/Min_1_Bin.html
- Format: binary, direct-access, unformatted, float32, little-endian
- Grid: 31 (lat) x 31 (lon) points, resolution 1.0° x 1.0°
- Lat range: 7.5°N to 37.5°N; Lon range: 67.5°E to 97.5°E (step 1.0 both)
- Missing value flag: **99.9**
- Record layout confirmed from real files: reshape as (days, lat=31, lon=31)
- VERIFIED on real 2025 files (both max and min): exact size match, 365 days.
- Maharashtra native temperature crop = **7 lat x 9 lon** on the 1.0°
  temperature grid — regridded up (nearest neighbour) onto the finer
  rainfall grid for fusion.

### INSAT (LST, SST, Rainfall/IMC) — NOT YET INTEGRATED
- Source: MOSDAC (https://www.mosdac.gov.in/), product names
  3RIMG_L2B_LST, 3RIMG_L2B_SST, 3RIMG_L2B_IMC
- Requires registration approval (pending as of this writing) for most
  products, BUT MOSDAC also has a no-login "Open Data" tier
  (https://www.mosdac.gov.in/open-data) for some derived Land/Ocean/
  Atmosphere products — worth checking if LST/SST specifically qualify.
- **Decision made: build and demo the ConvLSTM on IMD data alone (3
  channels: rainfall, maxT, minT). INSAT is designed-for in the
  architecture but not required for the working demo.** If MOSDAC access
  clears later, INSAT becomes a 4th fused channel using the same
  crop+regrid pattern already built for temperature.

### Years being used
- Files are uploaded by the user in batches (upload size constraints), not
  all at once. The pipeline script handles partial year sets gracefully —
  it only processes years where all 3 files (rainfall+maxT+minT) are
  present, and clearly reports which years are still incomplete.
- Current complete raw years visible after the Maharashtra scope expansion:
  **2020, 2021, 2022, 2024, 2025**. 2023 is incomplete because max temp is
  missing. No additional 10-year batch was visible in the raw folders during
  the latest rebuild.
- Current processed year range in the rebuilt clean dataset: **2020-2025
  with complete years only**, excluding incomplete 2023.
- Updated raw files are now visible for **2015-2025** across rainfall, max
  temperature, and min temperature. Latest processed clean dataset uses all
  complete years 2015 through 2025.

## 5. What's actually been built and verified (real code, real runs)

All of this is implemented and tested against real uploaded IMD files
(2025 data, all three types):

- `scripts/imd_parser.py` — reads both binary formats correctly, verified
  byte-exact against documented spec (no remainder on file-size / record
  calculation), missing-value flags identified and confirmed against real
  geography (e.g. ocean/coastal cells along Maharashtra correctly read as
  missing in rainfall).
- `scripts/maharashtra_fusion.py` — crops both grids to the Maharashtra bbox,
  regrids temperature (nearest-neighbour) onto rainfall's finer grid,
  stacks into one (days, lat, lon, 3) tensor. Verified Maharashtra crop
  shape: 27x33 rainfall cells; correct NaN handling is preserved.
- `build_dataset.py` — Stage 1 pipeline. Scans
  `datasets/raw_data/{rainfall,maxtemp,mintemp}/`, auto-detects year from
  filename (regex for 4-digit year), only processes years with all 3
  files present, concatenates all valid years chronologically, saves a
  timestamped `.npz` to `datasets/clean_data/` (never overwrites previous
  runs). VERIFIED after Maharashtra expansion on complete years 2020,
  2021, 2022, 2024, and 2025; 2023 was skipped because max temperature is
  missing. Latest output:
  `maharashtra_climate_2020-2025_built_2026-06-28_2125.npz`, shape
  `(1827, 27, 33, 3)`.
- Rebuilt again after the additional raw files were added. Latest output:
  `maharashtra_climate_2015-2025_built_2026-06-28_2208.npz`, shape
  `(4018, 27, 33, 3)`.
- `npz_to_csv.py` — flattens the clean `.npz` into a row-per-(date,lat,lon)
  CSV for easy inspection.
- `frontend/` — Vite + React dashboard shell using Leaflet with standard
  OpenStreetMap tiles, centered on Maharashtra with the 27x33 grid overlay loaded
  from a placeholder local JSON contract. Includes a rainfall legend and
  reserved blank panels for future what-if sliders, 3-day forecast chart,
  and anomaly flags. VERIFIED with `npm run build`; no backend/database is
  included.
- Frontend boundary decision: Maharashtra's own state boundary is now drawn
  explicitly from local vector data
  `frontend/src/data/maharashtra-boundary.geojson`, downloaded from the
  public `datta07/INDIAN-SHAPEFILES` repository. The grid overlay is clipped
  by testing each cell center against this polygon. Current clipped frontend
  grid count is **450 cells**, down from the full rectangular 27x33 = 891
  cells. This avoids relying on third-party base tile rendering for
  politically sensitive border accuracy, which matters for an ISRO
  submission.
- Frontend map decision: use Leaflet + OpenStreetMap instead of Mapbox GL JS
  because Mapbox requires a payment card on file even for free-tier usage.
  This student hackathon project should avoid any service that requires a
  billing account or card, even when nominally free.
- `train_model.py` — Stage 2 GPU-first ConvLSTM training script. Loads the
  clean `.npz`, builds 10-day input sequences to predict day+1, trains the
  locked small two-layer ConvLSTM (32 filters then 16 filters, 3x3 kernels),
  compares against persistence and day-of-year climatology, masks static
  missing cells, and writes real metrics/artifacts. The script defaults to
  CUDA and should be run on Google Colab/Kaggle GPU, not on the user's local
  CPU machine except for tiny syntax/smoke checks with `--device cpu`.
- Latest verified training run:
  `outputs/training/run_2026-06-28_181137/`, trained on CUDA for 10 epochs
  using the 2015-2025 clean dataset. Held-out test period was 2024-01-01
  through 2025-12-31. Real RMSE results:
  ConvLSTM rainfall **9.61 mm** vs persistence **12.47 mm** vs climatology
  **11.53 mm**; max temp **1.05 degC** vs **1.05 degC** vs **2.02 degC**;
  min temp **0.83 degC** vs **0.88 degC** vs **1.84 degC**. The checkpoint
  `best_model.pt` is small (~277 KB) and safe to commit. `test_predictions.npz`
  contains held-out truth tensors derived from licensed source data, so it
  must stay gitignored and be regenerated locally/Colab-side when needed.

## 6. What's NOT built yet (next steps, in order)

1. **What-if / analog engine** — given a user-specified perturbation
   (Δrainfall %, Δtemp °C, Δmonsoon-onset days), search the historical
   archive (the clean dataset) for the most similar past state via nearest-
   neighbour distance, return that year/date as the "analog" projection.
   Simple, explainable, no physics simulation — this is intentional, not
   a corner cut (see §3, no fabricated-sophistication rule).
2. **Grid-cell anomaly flagging** — compare a forecast/scenario output per
   cell against that cell's historical percentile for the same day-of-year;
   flag cells above e.g. the 90th percentile. Pure post-processing on
   existing outputs, no new model needed.
3. **Frontend dashboard, next layer** — the Leaflet-based React shell exists,
   but the what-if sliders, 3-day forecast chart, and anomaly flag display
   are intentionally blank reserved components. Next frontend work should
   connect those panels only after real model/analog/anomaly outputs exist;
   do not fake them.
4. **(Optional, mentioned only, not required to build):** "Bhuvan
   compatibility" — output map layers in standard WMS/WFS format. This is
   a documentation/positioning claim, not a feature that needs actual
   implementation for the hackathon.
5. **(Explicitly deprioritized, do not build unless asked):** an
   "offline/low-bandwidth mode" UI toggle — judged not worth the build
   effort relative to payoff for this hackathon; only mention as a
   one-line future-scope bullet if there's room in the deck.

## 7. Repo / environment setup already done

```
BAH2026/
├── datasets/
│   ├── raw_data/{rainfall,maxtemp,mintemp}/   <- raw .GRD files (gitignored)
│   └── clean_data/                             <- build_dataset.py output (gitignored)
├── scripts/
│   ├── imd_parser.py
│   └── maharashtra_fusion.py
├── frontend/                                  <- Vite React + Leaflet/OpenStreetMap dashboard shell
├── outputs/training/run_2026-06-28_181137/    <- public-safe metrics/checkpoint artifacts
├── build_dataset.py
├── npz_to_csv.py
├── train_model.py
├── requirements.txt
├── .gitignore        <- excludes raw_data/*, clean_data/*.npz, __pycache__, venv
├── README.md
└── context.md         <- this file
```

- Python venv already set up by the user (Windows, PowerShell).
- Python dependencies currently tracked in `requirements.txt`: `numpy`,
  `torch`, and `matplotlib`.
- Frontend dependencies are managed separately in `frontend/package.json`
  and `frontend/package-lock.json`. The frontend uses Leaflet with
  OpenStreetMap tiles and does not require an API key, token, signup, or
  payment method.
- PyTorch is used for `train_model.py`. Full model training must be done on
  Google Colab/Kaggle GPU. Do **not** run full training on the user's local
  CPU machine again; local checks should be limited to syntax/import/help or
  deliberately tiny smoke tests.

## 8. Tone / framing rules for any generated text (slides, docstrings, comments)

- Never write as if comparing favorably against "other teams" or "most
  submissions" in anything user-facing (slides) — state capabilities
  positively, don't disparage unnamed competitors. (Internal code comments
  explaining *why* a design choice was made are fine.)
- Be precise about current vs. future capability everywhere. If something
  is a future-scope idea, label it as such, every time, no exceptions.
- The project deliberately undersells nothing but also does not overclaim
  resolution, accuracy, or scope beyond what's actually been verified.

## 9. Useful contacts / citations already confirmed correct

- Rainfall data citation: Pai D.S. et al. (2014), MAUSAM, 65(1), pp1-18.
- Temperature data citation: Srivastava A.K., Rajeevan M., Kshirsagar S.R.
  (2009), Atmospheric Science Letters.
- IMD data contact: cmagpune@gmail.com (Climate Prediction Group, Pune)
- MOSDAC feedback contact: admin@mosdac.gov.in
