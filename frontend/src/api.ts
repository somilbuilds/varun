/**
 * Thin fetch wrappers for VARUN's FastAPI backend.
 * Responses are cached in-memory; requests time out instead of hanging forever.
 */

import type { ApiGridPayload, ApiMetrics } from "./types";

const cache = new Map<string, ApiGridPayload>();
const inflight = new Map<string, Promise<ApiGridPayload>>();
const FETCH_TIMEOUT_MS = 12_000;

async function fetchJson<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(`/api${path}`, { signal: controller.signal });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(
        `API error ${res.status} for ${path}: ${body?.detail ?? res.statusText}`,
      );
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(
        `Request timed out for ${path}. Is the API running? ` +
          "Start it with: python -m uvicorn api_server:app --host 127.0.0.1 --port 8000",
      );
    }
    throw err;
  } finally {
    window.clearTimeout(timer);
  }
}

function fetchCached(path: string): Promise<ApiGridPayload> {
  const hit = cache.get(path);
  if (hit) return Promise.resolve(hit);

  const pending = inflight.get(path);
  if (pending) return pending;

  const promise = fetchJson<ApiGridPayload>(path)
    .then((data) => {
      cache.set(path, data);
      inflight.delete(path);
      return data;
    })
    .catch((err) => {
      inflight.delete(path);
      throw err;
    });

  inflight.set(path, promise);
  return promise;
}

export function fetchClimatology(): Promise<ApiGridPayload> {
  return fetchCached("/historical/climatology");
}

export function fetchHistorical(date: string): Promise<ApiGridPayload> {
  return fetchCached(`/historical/${date}`);
}

export function fetchNowcast(): Promise<ApiGridPayload> {
  return fetchCached("/nowcast");
}

export function fetchForecast(): Promise<ApiGridPayload> {
  return fetchCached("/forecast/tomorrow");
}

export function fetchValidationMetrics(): Promise<ApiMetrics> {
  return fetchJson("/validation-metrics");
}

export function prefetchHistoricalDates(dates: string[]): void {
  for (const date of dates) {
    fetchHistorical(date).catch(() => undefined);
  }
}

export function getHistoricalFromCache(date: string): ApiGridPayload | undefined {
  return cache.get(`/historical/${date}`);
}

export function getModePayloadFromCache(
  mode: "climatology" | "nowcast" | "forecast",
): ApiGridPayload | undefined {
  if (mode === "climatology") return cache.get("/historical/climatology");
  if (mode === "nowcast") return cache.get("/nowcast");
  if (mode === "forecast") return cache.get("/forecast/tomorrow");
  return undefined;
}
