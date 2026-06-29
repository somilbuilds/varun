import type { ApiGridPayload, DisplayChannel } from "./types";

export type ChannelValues = ApiGridPayload["values"];

export function extractChannelGrid(
  values: ChannelValues | undefined,
  channel: DisplayChannel,
): (number | null)[][] | null {
  if (!values) return null;

  if (channel === "rainfall" || channel === "max_temp" || channel === "min_temp") {
    return values[channel] ?? null;
  }

  const maxGrid = values.max_temp;
  const minGrid = values.min_temp;
  if (!maxGrid || !minGrid) return null;

  return maxGrid.map((row, r) =>
    row.map((maxVal, c) => {
      const minVal = minGrid[r]?.[c] ?? null;
      if (maxVal === null || minVal === null) return null;
      if (channel === "mean_temp") return (maxVal + minVal) / 2;
      return maxVal - minVal;
    }),
  );
}

export function getChannelUnit(channel: DisplayChannel): string {
  switch (channel) {
    case "rainfall":
      return "mm/day";
    case "max_temp":
    case "min_temp":
    case "mean_temp":
      return "°C";
    case "temp_range":
      return "°C span";
    default:
      return "";
  }
}

export function getChannelLabel(channel: DisplayChannel): string {
  switch (channel) {
    case "rainfall":
      return "Rainfall";
    case "max_temp":
      return "Max Temp";
    case "min_temp":
      return "Min Temp";
    case "mean_temp":
      return "Mean Temp";
    case "temp_range":
      return "Diurnal Range";
    default:
      return channel;
  }
}

export function gridStats(grid: (number | null)[][] | null) {
  if (!grid) return null;
  const flat = grid.flat().filter((v): v is number => v !== null && Number.isFinite(v));
  if (flat.length === 0) return null;
  return {
    min: Math.min(...flat),
    max: Math.max(...flat),
    mean: flat.reduce((a, b) => a + b, 0) / flat.length,
    validCells: flat.length,
  };
}
