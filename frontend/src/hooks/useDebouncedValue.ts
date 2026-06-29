import { useEffect, useState } from "react";

/** Debounce a value — skips delay when immediate=true (e.g. cache hits during play). */
export function useDebouncedValue<T>(value: T, delayMs: number, immediate = false): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    if (immediate) {
      setDebounced(value);
      return;
    }
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs, immediate]);

  return immediate ? value : debounced;
}
