# Maharashtra Climate Digital Twin (BAH 2026 — PS5)

AI-powered digital twin pilot for Maharashtra, fusing IMD ground-based gridded
rainfall/temperature data with (planned) INSAT satellite observations to
produce short-term climate predictions and "what-if" scenario analysis.

Built for ISRO Bharatiya Antariksh Hackathon 2026 — Problem Statement 5
(AI-Powered Digital Twin of India's Climate using India's National Data).

## What's actually implemented here (real, runnable code)

- A verified binary parser for IMD's `.GRD` gridded rainfall and
  temperature format (`scripts/imd_parser.py`)
- A Maharashtra bounding-box crop + temperature regridding step that fuses
  rainfall + max temp + min temp into one aligned tensor
  (`scripts/maharashtra_fusion.py`)
- A pipeline script that scans any number of yearly raw files and builds
  one clean, versioned dataset file (`build_dataset.py`)
- A Vite + React frontend using Leaflet with OpenStreetMap tiles, centered
  on Maharashtra with the real 27x33 grid footprint wired to placeholder local JSON
  (`frontend/`)
- A local Maharashtra state boundary GeoJSON overlay from the public
  `datta07/INDIAN-SHAPEFILES` repository, used to draw the state outline
  explicitly and clip grid cells by center point

ConvLSTM training, the what-if scenario engine, and anomaly computation
are documented in the proposal deck and built incrementally on top of this
verified data pipeline. The frontend currently reserves space for those
panels without implementing fake functionality.

## Project structure

```
BAH2026/
├── datasets/
│   ├── raw_data/
│   │   ├── rainfall/      <- place Rainfall_ind{YEAR}_rfp25.grd files here
│   │   ├── maxtemp/       <- place Maxtemp_MaxT_{YEAR}.GRD files here
│   │   └── mintemp/       <- place Mintemp_MinT_{YEAR}.GRD files here
│   └── clean_data/        <- build_dataset.py writes output .npz files here
├── scripts/
│   ├── imd_parser.py      <- low-level binary format reader
│   └── maharashtra_fusion.py <- crop / regrid / fuse helpers
├── frontend/              <- Vite React + Leaflet/OpenStreetMap dashboard shell
└── build_dataset.py       <- run this to (re)build the clean dataset
```

## Getting the data

Raw IMD data is **not included in this repo** (large binary files, IMD's
terms don't cover redistribution). Download directly from IMD Pune:

- Rainfall (0.25° × 0.25°): https://www.imdpune.gov.in/cmpg/Griddata/Rainfall_25_Bin.html
- Max Temperature (1.0° × 1.0°): https://imdpune.gov.in/cmpg/Griddata/Max_1_Bin.html
- Min Temperature (1.0° × 1.0°): https://www.imdpune.gov.in/cmpg/Griddata/Min_1_Bin.html

Pick a year, download the `.GRD`/`.grd` file, drop it in the matching
`datasets/raw_data/<type>/` folder. Filenames just need a 4-digit year
somewhere in them — the script auto-detects it.

## Running the pipeline

```bash
pip install numpy
python build_dataset.py
```

The script:
1. Scans all three `raw_data` subfolders
2. Only processes years where **all three** files (rainfall + maxT + minT) are present
3. Crops each year to the Maharashtra bounding box (15.5–22.0°N, 72.5–80.5°E)
4. Regrids temperature onto rainfall's finer 0.25° grid
5. Stacks them into one `(days, lat, lon, 3)` tensor
6. Saves a new timestamped file to `datasets/clean_data/` — never overwrites previous runs

Output filename example: `maharashtra_climate_2020-2025_built_2026-06-28_1154.npz`

Current Maharashtra crop facts:

- Rainfall grid shape: `27 lat x 33 lon = 891 cells`
- Lat range used: `15.5°N` to `22.0°N`
- Lon range used: `72.5°E` to `80.5°E`
- This is a scope expansion for more coverage and more grid cells, not a resolution fix; per-cell resolution remains IMD's native 0.25° rainfall grid.
- Latest clean build after adding the 2015-2025 raw files uses complete
  years `2015` through `2025`, with final tensor shape `(4018, 27, 33, 3)`.

## Running the frontend

The frontend is a standard Vite React app using Leaflet and OpenStreetMap
tiles. It needs no API key, no signup, and no payment method on file. This
is intentional: the project avoids services that require a billing account
even when they advertise a nominal free tier.

```bash
cd frontend
npm install
npm run dev
```

For later free deployment on Vercel or Netlify, use:

- build command: `npm run build`
- publish directory: `frontend/dist`

Current frontend scope:

- Leaflet map centered on Maharashtra with OpenStreetMap standard tiles
- 27x33 Maharashtra grid overlay loaded from `frontend/src/data/maharashtra-grid-placeholder.json`
- Maharashtra boundary overlay loaded locally from
  `frontend/src/data/maharashtra-boundary.geojson`
- grid cells clipped to the state boundary using each cell center point
- current clipped placeholder grid renders `450` cells inside/on the
  Maharashtra boundary, down from the full rectangular `891` cells
- rainfall legend
- blank reserved panels for what-if sliders, 3-day forecast chart, and anomaly flags

The boundary is drawn from local vector data instead of relying on the base
tile layer's border rendering. This is deliberate for an ISRO submission:
the app should not depend on third-party tile styling for politically
sensitive border accuracy.

## Loading the clean dataset (for training)

```python
import numpy as np
data = np.load("datasets/clean_data/maharashtra_climate_....npz")
fused = data["fused"]       # shape (days, lat, lon, 3) -- [rainfall, maxT, minT]
dates = data["dates"]       # "YYYY-MM-DD" strings, aligned to fused
lats, lons = data["lats"], data["lons"]
```

## Data source citations

- Rainfall: Pai D.S. et al. (2014), *Development of a new high spatial
  resolution (0.25°×0.25°) long period (1901-2010) daily gridded rainfall
  data set over India*, MAUSAM, 65(1), pp1-18.
- Temperature: Srivastava A.K., Rajeevan M., Kshirsagar S.R. (2009),
  *Development of High Resolution Daily Gridded Temperature Data Set
  (1969-2005) for the Indian Region*, Atmospheric Science Letters.
