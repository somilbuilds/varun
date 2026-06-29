import type { DisplayChannel } from "./types";
import { getLegendStops } from "./colors";

const lutCache = new Map<DisplayChannel, Uint8ClampedArray>();

function parseHex(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function lerpChannel(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

/** 256-step RGB lookup table for fast gradient rasterization. */
export function getColorLut(channel: DisplayChannel): Uint8ClampedArray {
  const cached = lutCache.get(channel);
  if (cached) return cached;

  const stops = getLegendStops(channel);
  const parsed = stops.map(parseHex);
  const lut = new Uint8ClampedArray(256 * 3);

  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    const scaled = t * (parsed.length - 1);
    const lower = Math.floor(scaled);
    const upper = Math.min(parsed.length - 1, lower + 1);
    const frac = scaled - lower;
    const [r0, g0, b0] = parsed[lower];
    const [r1, g1, b1] = parsed[upper];
    const offset = i * 3;
    lut[offset] = lerpChannel(r0, r1, frac);
    lut[offset + 1] = lerpChannel(g0, g1, frac);
    lut[offset + 2] = lerpChannel(b0, b1, frac);
  }

  lutCache.set(channel, lut);
  return lut;
}
