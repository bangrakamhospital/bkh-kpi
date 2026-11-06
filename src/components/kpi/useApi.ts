"use client";

import { useCallback, useEffect, useState } from "react";

interface Result<T> {
  key: string;
  data?: T;
  error?: boolean;
  truncated?: boolean;
  /** HTTP 401: login required / session expired. */
  unauthorized?: boolean;
}

/**
 * GET JSON array with loading/error state, aborts on url change/unmount.
 * A 401 is reported as `unauthorized` (not `error`) so callers can show
 * the login form.
 */
export function useApiList<T>(url: string) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result<T[]> | null>(null);
  const key = `${url}#${attempt}`;

  useEffect(() => {
    const controller = new AbortController();
    fetch(url, { signal: controller.signal, cache: "no-store" })
      .then(async (res) => {
        if (res.status === 401) {
          setResult({ key, unauthorized: true });
          return;
        }
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
    unauthorized: current?.unauthorized === true,
    data: current?.data,
    retry,
  };
}
