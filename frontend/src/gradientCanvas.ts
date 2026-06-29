import type { DisplayChannel } from "./types";
import { getColorLut } from "./colorLut";
import {
  CLIPPED_CELL_RECTS,
  GRADIENT_BOUNDS,
  GRADIENT_HEIGHT,
  GRADIENT_WIDTH,
} from "./gridCells";

const urlCache = new Map<string, string>();
const URL_CACHE_MAX = 32;

function rememberUrl(key: string, url: string): string {
  const existing = urlCache.get(key);
  if (existing && existing !== url) {
    URL.revokeObjectURL(existing);
  }
  urlCache.set(key, url);
  if (urlCache.size > URL_CACHE_MAX) {
    const oldest = urlCache.keys().next().value;
    if (oldest) {
      URL.revokeObjectURL(urlCache.get(oldest)!);
      urlCache.delete(oldest);
    }
  }
  return url;
}

function rasterizeFromCells(
  valueGrid: (number | null)[][],
  displayChannel: DisplayChannel,
  minVal: number,
  maxVal: number,
): HTMLCanvasElement {
  const coarse = document.createElement("canvas");
  coarse.width = GRADIENT_WIDTH;
  coarse.height = GRADIENT_HEIGHT;
  const cctx = coarse.getContext("2d");
  if (!cctx) return coarse;

  const span = Math.max(maxVal - minVal, 1e-6);
  const lut = getColorLut(displayChannel);

  for (const [row, col, x, y, w, h] of CLIPPED_CELL_RECTS) {
    const value = valueGrid[row]?.[col] ?? null;
    if (value === null) continue;
    const li = Math.max(0, Math.min(255, Math.round(((value - minVal) / span) * 255))) * 3;
    cctx.fillStyle = `rgb(${lut[li]},${lut[li + 1]},${lut[li + 2]})`;
    cctx.fillRect(x, y, w + 0.5, h + 0.5);
  }

  const out = document.createElement("canvas");
  out.width = GRADIENT_WIDTH;
  out.height = GRADIENT_HEIGHT;
  const octx = out.getContext("2d");
  if (!octx) return coarse;

  octx.imageSmoothingEnabled = true;
  octx.filter = "blur(2.5px)";
  octx.drawImage(coarse, 0, 0);
  octx.filter = "none";
  octx.globalAlpha = 0.92;
  octx.drawImage(coarse, 0, 0);
  octx.globalAlpha = 1;

  return out;
}

export function buildGradientCacheKey(
  displayChannel: DisplayChannel,
  minVal: number,
  maxVal: number,
  frameKey: string,
): string {
  return `${displayChannel}|${frameKey}|${minVal.toFixed(1)}|${maxVal.toFixed(1)}`;
}

export function buildGradientUrlAsync(
  valueGrid: (number | null)[][],
  displayChannel: DisplayChannel,
  minVal: number,
  maxVal: number,
  frameKey: string,
): Promise<string> {
  const key = buildGradientCacheKey(displayChannel, minVal, maxVal, frameKey);
  const cachedUrl = urlCache.get(key);
  if (cachedUrl) return Promise.resolve(cachedUrl);

  return new Promise((resolve, reject) => {
    window.setTimeout(() => {
      try {
        const canvas = rasterizeFromCells(valueGrid, displayChannel, minVal, maxVal);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Failed to encode gradient"));
              return;
            }
            resolve(rememberUrl(key, URL.createObjectURL(blob)));
          },
          "image/jpeg",
          0.85,
        );
      } catch (err) {
        reject(err);
      }
    }, 0);
  });
}

export { GRADIENT_BOUNDS };
