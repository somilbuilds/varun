import type { DisplayChannel } from "./types";

export function getRainfallColor(value: number | null): string {
  if (value === null || value === undefined) return "#ccc";
  if (value >= 100) return "#d62828";
  if (value >= 64) return "#e85d04";
  if (value >= 35) return "#ffb703";
  if (value >= 15) return "#219ebc";
  if (value >= 5) return "#8ecae6";
  return "#eef8ff";
}

export function getTempColor(value: number | null, channel: "max_temp" | "min_temp" | "mean_temp"): string {
  if (value === null || value === undefined) return "#ccc";
  if (channel === "max_temp" || channel === "mean_temp") {
    if (value >= 44) return "#7f0000";
    if (value >= 40) return "#d62828";
    if (value >= 36) return "#f4a261";
    if (value >= 32) return "#ffb703";
    if (value >= 28) return "#8ecae6";
    return "#caf0f8";
  }
  if (value >= 28) return "#d62828";
  if (value >= 24) return "#ffb703";
  if (value >= 20) return "#8ecae6";
  if (value >= 16) return "#caf0f8";
  return "#e0f7fa";
}

export function getRangeColor(value: number | null): string {
  if (value === null || value === undefined) return "#ccc";
  if (value >= 18) return "#7f0000";
  if (value >= 14) return "#d62828";
  if (value >= 10) return "#ffb703";
  if (value >= 6) return "#8ecae6";
  return "#caf0f8";
}

export function getCellColor(value: number | null, channel: DisplayChannel): string {
  if (channel === "rainfall") return getRainfallColor(value);
  if (channel === "temp_range") return getRangeColor(value);
  if (channel === "max_temp" || channel === "min_temp" || channel === "mean_temp") {
    return getTempColor(value, channel === "min_temp" ? "min_temp" : channel);
  }
  return "#ccc";
}

export function getLegendStops(channel: DisplayChannel): string[] {
  if (channel === "rainfall") {
    return ["#eef8ff", "#8ecae6", "#219ebc", "#ffb703", "#e85d04", "#d62828"];
  }
  if (channel === "temp_range") {
    return ["#caf0f8", "#8ecae6", "#ffb703", "#d62828", "#7f0000"];
  }
  if (channel === "max_temp" || channel === "mean_temp") {
    return ["#caf0f8", "#8ecae6", "#ffb703", "#f4a261", "#d62828", "#7f0000"];
  }
  return ["#e0f7fa", "#caf0f8", "#8ecae6", "#ffb703", "#d62828"];
}

/** Map a normalized 0–1 value to an RGB color using channel stops. */
export function colorAtNormalized(t: number, channel: DisplayChannel): string {
  const stops = getLegendStops(channel);
  const clamped = Math.max(0, Math.min(1, t));
  const scaled = clamped * (stops.length - 1);
  const lower = Math.floor(scaled);
  const upper = Math.min(stops.length - 1, lower + 1);
  const frac = scaled - lower;
  return lerpHex(stops[lower], stops[upper], frac);
}

function lerpHex(a: string, b: string, t: number): string {
  const ar = parseInt(a.slice(1, 3), 16);
  const ag = parseInt(a.slice(3, 5), 16);
  const ab = parseInt(a.slice(5, 7), 16);
  const br = parseInt(b.slice(1, 3), 16);
  const bg = parseInt(b.slice(3, 5), 16);
  const bb = parseInt(b.slice(5, 7), 16);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}
