import { useEffect, useState } from "react";
import type { ApiMetrics, MetricRow } from "../types";
import { fetchValidationMetrics } from "../api";

type LoadState = "idle" | "loading" | "ok" | "error";

const CHANNELS: Array<{ key: MetricRow["channel"]; label: string }> = [
  { key: "rainfall", label: "Rainfall (mm)" },
  { key: "max_temp", label: "Max Temp (°C)" },
  { key: "min_temp", label: "Min Temp (°C)" },
];

const METHOD_LABELS: Record<string, string> = {
  convlstm: "VARUN ConvLSTM",
  persistence: "Persistence",
  climatology: "Climatology",
};

const METHOD_COLORS: Record<string, string> = {
  convlstm: "#219ebc",
  persistence: "#ffb703",
  climatology: "#a8a8a8",
};

export default function ValidationChart() {
  const [metrics, setMetrics] = useState<ApiMetrics | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    setLoadState("loading");
    fetchValidationMetrics()
      .then((m) => { setMetrics(m); setLoadState("ok"); })
      .catch((err: unknown) => {
        setErrorMsg(err instanceof Error ? err.message : String(err));
        setLoadState("error");
      });
  }, []);

  if (loadState === "loading") {
    return <div className="validation-chart loading-pulse">Loading validation metrics…</div>;
  }
  if (loadState === "error") {
    return (
      <div className="validation-chart validation-error">
        <strong>Could not load metrics.</strong>
        <p>{errorMsg}</p>
      </div>
    );
  }
  if (!metrics) return null;

  // Get max RMSE across all rows to set bar scale
  const maxRmse = Math.max(...metrics.metrics.map((m) => m.rmse));

  return (
    <div className="validation-chart">
      <div className="vc-header">
        <h3>Model Validation — Test Period</h3>
        <p className="vc-subtitle">
          Held-out test: {metrics.split.test_start} → {metrics.split.test_end}&nbsp;
          ({metrics.split.test_targets} days) · RMSE ↓ is better
        </p>
      </div>

      {CHANNELS.map(({ key, label }) => {
        const rows = metrics.metrics.filter((m) => m.channel === key);
        return (
          <div key={key} className="vc-channel-block">
            <div className="vc-channel-label">{label}</div>
            {["convlstm", "persistence", "climatology"].map((method) => {
              const row = rows.find((r) => r.method === method);
              if (!row) return null;
              const pct = (row.rmse / maxRmse) * 100;
              const isModel = method === "convlstm";
              return (
                <div key={method} className={`vc-row${isModel ? " vc-row--model" : ""}`}>
                  <span className="vc-method-label">{METHOD_LABELS[method]}</span>
                  <div className="vc-bar-wrap">
                    <div
                      className="vc-bar"
                      style={{
                        width: `${pct.toFixed(1)}%`,
                        background: METHOD_COLORS[method],
                      }}
                    />
                  </div>
                  <span className="vc-rmse-val">
                    {row.rmse.toFixed(2)} {row.unit}
                  </span>
                </div>
              );
            })}
          </div>
        );
      })}

      <p className="vc-footer">
        Data: IMD 2015–2025 · Model: 2-layer ConvLSTM, {metrics.training.parameter_count.toLocaleString()} params ·
        Real numbers from actual training run — not estimated.
      </p>
    </div>
  );
}
