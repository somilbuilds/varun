import { memo, useMemo } from "react";
import type { ApiChannelValues, ApiGridPayload } from "../types";

type Props = {
  currentValues: ApiChannelValues | null;
  climatology: ApiGridPayload | null;
  activeDate?: string;
};

type FlagCounts = {
  rainfall: number;
  maxHeat: number;
  minHeat: number;
};

function countAnomalies(
  current: ApiChannelValues,
  climatology: ApiChannelValues,
): FlagCounts {
  const counts: FlagCounts = { rainfall: 0, maxHeat: 0, minHeat: 0 };
  const rows = current.rainfall.length;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < (current.rainfall[r]?.length ?? 0); c++) {
      const rain = current.rainfall[r]?.[c];
      const rainBase = climatology.rainfall[r]?.[c];
      if (rain !== null && rainBase !== null && rainBase > 0 && rain >= rainBase * 2 && rain >= 5) {
        counts.rainfall += 1;
      }

      const maxT = current.max_temp[r]?.[c];
      const maxBase = climatology.max_temp[r]?.[c];
      if (maxT !== null && maxBase !== null && maxT >= maxBase + 3) {
        counts.maxHeat += 1;
      }

      const minT = current.min_temp[r]?.[c];
      const minBase = climatology.min_temp[r]?.[c];
      if (minT !== null && minBase !== null && minT >= minBase + 3) {
        counts.minHeat += 1;
      }
    }
  }

  return counts;
}

function AnomalyPreviewPanel({ currentValues, climatology, activeDate }: Props) {
  const counts = useMemo(() => {
    if (!currentValues || !climatology?.values) return null;
    return countAnomalies(currentValues, climatology.values);
  }, [currentValues, climatology]);

  const totalFlags = counts ? counts.rainfall + counts.maxHeat + counts.minHeat : 0;

  return (
    <section className="panel panel--anomaly" aria-label="Anomaly flag display">
      <div className="panel-title-row">
        <h2>Anomaly Flags</h2>
        <span className="panel-badge panel-badge--real">Preview</span>
      </div>

      <p className="anomaly-intro">
        Grid cells flagged when the current view exceeds the long-term historical mean by simple
        thresholds. This is rainfall/heat anomaly highlighting — not flood-risk modelling.
      </p>

      {!climatology && (
        <p className="anomaly-empty">Loading historical baseline…</p>
      )}

      {climatology && !currentValues && (
        <p className="anomaly-empty">Waiting for map data…</p>
      )}

      {counts && (
        <>
          <div className="anomaly-summary">
            <span className="anomaly-total">{totalFlags}</span>
            <span className="anomaly-total-label">cells flagged vs historical mean</span>
          </div>

          <ul className="anomaly-list">
            <li>
              <span className="anomaly-dot anomaly-dot--rain" />
              <strong>{counts.rainfall}</strong> elevated rainfall
              <span className="anomaly-rule">≥2× mean &amp; ≥5 mm/day</span>
            </li>
            <li>
              <span className="anomaly-dot anomaly-dot--heat" />
              <strong>{counts.maxHeat}</strong> warm max-temp cells
              <span className="anomaly-rule">≥ mean + 3 °C</span>
            </li>
            <li>
              <span className="anomaly-dot anomaly-dot--heat" />
              <strong>{counts.minHeat}</strong> warm min-temp cells
              <span className="anomaly-rule">≥ mean + 3 °C</span>
            </li>
          </ul>

          {activeDate && (
            <p className="anomaly-footer">
              Comparing <strong>{activeDate}</strong> against climatology mean (
              {climatology.date_range?.[0]} → {climatology.date_range?.[1]}).
            </p>
          )}

          <p className="anomaly-note">
            Full percentile-based flagging (e.g. 90th percentile by day-of-year) is planned next.
          </p>
        </>
      )}
    </section>
  );
}

export default memo(AnomalyPreviewPanel);
