import { useEffect, useState } from "react";

type Status = "checking" | "ok" | "down";

export default function ApiStatusBanner() {
  const [status, setStatus] = useState<Status>("checking");
  const [detail, setDetail] = useState("");

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 5000);

    fetch("/api/health", { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await res.json();
        if (!cancelled) setStatus("ok");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setStatus("down");
        if (err instanceof DOMException && err.name === "AbortError") {
          setDetail("No response within 5s.");
        } else {
          setDetail(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => window.clearTimeout(timer));

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, []);

  if (status === "ok") return null;

  return (
    <div className={`api-banner api-banner--${status}`} role="status">
      {status === "checking" ? (
        <span>Checking API connection…</span>
      ) : (
        <>
          <strong>Backend API not reachable.</strong>
          <span>
            Start it first:{" "}
            <code>python -m uvicorn api_server:app --host 127.0.0.1 --port 8000</code>
            {detail ? ` (${detail})` : ""}
          </span>
        </>
      )}
    </div>
  );
}
