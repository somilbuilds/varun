// ---------------------------------------------------------------------------
// Legacy type used by grid.ts / buildGridGeoJson (boundary-clip utilities)
// ---------------------------------------------------------------------------
export type GridChannel = "rainfall_mm";

export type PlaceholderGridData = {
  metadata: {
    name: string;
    status: "placeholder";
    note: string;
    date: string | null;
  };
  bbox: {
    south: number;
    north: number;
    west: number;
    east: number;
  };
  gridShape: {
    rows: number;
    cols: number;
  };
  channels: GridChannel[];
  values: Record<GridChannel, number[][]>;
  units: Record<GridChannel, string>;
};

// ---------------------------------------------------------------------------
// Real API response types (served by api_server.py)
// ---------------------------------------------------------------------------

/** Bounding box as returned by every grid endpoint. */
export type ApiBbox = {
  south: number;
  north: number;
  west: number;
  east: number;
};

/** Shape descriptor as returned by every grid endpoint. */
export type ApiGridShape = { rows: number; cols: number };

export type ApiChannelValues = {
  rainfall: (number | null)[][];
  max_temp: (number | null)[][];
  min_temp: (number | null)[][];
};

/** One day in a multi-day timeline response */
export type ApiDailyFrame = {
  date: string;
  frame_type?: "observed" | "forecast";
  values: ApiChannelValues;
};

/** All-channels grid payload (historical, climatology, nowcast, forecast). */
export type ApiGridPayload = {
  type: "historical" | "climatology" | "nowcast" | "forecast";
  bbox: ApiBbox;
  gridShape: ApiGridShape;
  /** Row-major values per channel (null = missing/NaN). */
  values: ApiChannelValues;
  units: { rainfall: string; max_temp: string; min_temp: string };
  date?: string;
  date_range?: [string, string];
  n_days?: number;
  description?: string;
  data_as_of?: string;
  fetched_at?: string;
  source?: string;
  window_dates?: string[];
  daily_frames?: ApiDailyFrame[];
  timeline_resolution?: "daily";
  lag_note?: string;
  prediction_date?: string;
  input_window?: { start: string; end: string };
  model?: string;
  disclaimer?: string;
};

/** Single metric row in metrics.json */
export type MetricRow = {
  method: "convlstm" | "persistence" | "climatology";
  channel: "rainfall" | "max_temp" | "min_temp";
  unit: string;
  rmse: number;
  mae: number;
  valid_values: number;
};

/** Full validation metrics payload */
export type ApiMetrics = {
  created_at: string;
  data_file: string;
  data_shape: number[];
  date_range: [string, string];
  split: {
    train_end: string;
    validation_end: string;
    test_start: string;
    test_end: string;
    train_targets: number;
    validation_targets: number;
    test_targets: number;
  };
  training: {
    epochs_completed: number;
    batch_size: number;
    learning_rate: number;
    device: string;
    parameter_count: number;
  };
  metrics: MetricRow[];
};

/** View modes for the map controls */
export type ViewMode = "climatology" | "historical" | "nowcast" | "forecast";

/** Base API channels plus derived display channels */
export type DisplayChannel =
  | "rainfall"
  | "max_temp"
  | "min_temp"
  | "mean_temp"
  | "temp_range";

export type MapRenderMode = "grid" | "gradient";

export const HISTORY_START = "2015-01-01";
export const HISTORY_END = "2025-12-31";
