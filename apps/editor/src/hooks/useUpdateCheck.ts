import { useCallback, useEffect, useRef, useState } from "react";
import { checkForUpdate, type UpdateCheckResult } from "../lib/updateCheck.js";

export type UpdateStatus = "idle" | "checking" | "available" | "current" | "error";

export interface UseUpdateCheck {
  status: UpdateStatus;
  result: UpdateCheckResult | null;
  error: string | null;
  check: () => Promise<void>;
}

/**
 * Fetches the latest editor version and compares it against the running build.
 * Pass `{ auto: true }` to check once on mount (used for the boot-time popup).
 */
export function useUpdateCheck(options?: { auto?: boolean }): UseUpdateCheck {
  const auto = options?.auto ?? false;
  const [status, setStatus] = useState<UpdateStatus>(auto ? "checking" : "idle");
  const [result, setResult] = useState<UpdateCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const check = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setStatus("checking");
    setError(null);
    try {
      const res = await checkForUpdate();
      setResult(res);
      setStatus(res.updateAvailable ? "available" : "current");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    if (!auto) return;
    let cancelled = false;
    inFlight.current = true;
    void checkForUpdate()
      .then((res) => {
        if (cancelled) return;
        setResult(res);
        setStatus(res.updateAvailable ? "available" : "current");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setStatus("error");
      })
      .finally(() => {
        inFlight.current = false;
      });
    return () => {
      cancelled = true;
    };
  }, [auto]);

  return { status, result, error, check };
}
