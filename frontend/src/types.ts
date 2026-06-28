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
