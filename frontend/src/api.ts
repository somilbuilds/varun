/**
 * Thin fetch wrappers for VARUN's FastAPI backend.
 * All functions throw on non-OK responses so callers must handle errors.
 */

import type { ApiGridPayload, ApiMetrics } from "./types";

const BASE = "/api";

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(
      `API error ${res.status} for ${path}: ${body?.detail ?? res.statusText}`
    );
  }
  return res.json() as Promise<T>;
}

export function fetchClimatology(): Promise<ApiGridPayload> {
  return fetchJson("/historical/climatology");
}

export function fetchHistorical(date: string): Promise<ApiGridPayload> {
  return fetchJson(`/historical/${date}`);
}

export function fetchNowcast(): Promise<ApiGridPayload> {
  return fetchJson("/nowcast");
}

export function fetchForecast(): Promise<ApiGridPayload> {
  return fetchJson("/forecast/tomorrow");
}

export function fetchValidationMetrics(): Promise<ApiMetrics> {
  return fetchJson("/validation-metrics");
}
