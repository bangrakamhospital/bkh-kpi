"use client";

import { useCallback, useEffect, useState } from "react";

interface Result<T> {
  key: string;
  data?: T;
  error?: boolean;
  truncated?: boolean;
}

/** GET JSON array with loading/error state, aborts on url change/unmount. */
export function useApiList<T>(url: string) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result<T[]> | null>(null);
  const key = `${url}#${attempt}`;

  useEffect(() => {
    const controller = new AbortController();
    fetch(url, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error("request failed");
        const json: unknown = await res.json();
        if (!Array.isArray(json)) throw new Error("invalid response");
        setResult({
          key,
          data: json as T[],
          truncated: res.headers.get("X-Result-Truncated") === "true",
        });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setResult({ key, error: true });
      });
    return () => controller.abort();
  }, [url, key]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const current = result?.key === key ? result : null;
  return {
    loading: current === null,
    error: current?.error === true,
    truncated: current?.truncated === true,
    data: current?.data,
    retry,
  };
}
