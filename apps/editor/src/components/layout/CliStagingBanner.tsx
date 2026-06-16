import { useEffect, useState } from "react";
import { Loader2, AlertTriangle, X } from "lucide-react";
import { Icon } from "../icons/Icon.js";
import type { CliStagingState } from "../../types/electron";

// First launch after an install/upgrade copies the ~200 MB build CLI workspace out of
// the read-only Windows package dir (see electron/main.mjs). It runs after the window
// is shown; this banner reports progress and reassures the user the app is not frozen.
export function CliStagingBanner() {
  const [state, setState] = useState<CliStagingState>({ phase: "ready" });
  const [dismissedError, setDismissedError] = useState(false);

  useEffect(() => {
    const electron = window.electronAPI;
    if (!electron?.onCliStaging) return;
    void electron.getCliStagingState?.().then(setState);
    return electron.onCliStaging((next) => {
      setState(next);
      if (next.phase === "preparing") setDismissedError(false);
    });
  }, []);

  if (state.phase === "ready") return null;
  if (state.phase === "error" && dismissedError) return null;

  const percent =
    state.phase === "preparing" && state.total > 0
      ? Math.min(100, Math.round((state.copied / state.total) * 100))
      : null;

  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-50 -translate-x-1/2">
      <div className="pointer-events-auto w-80 rounded-lg border border-border bg-surface-2 px-4 py-3 shadow-lg">
        {state.phase === "preparing" ? (
          <>
            <div className="flex items-center gap-2 text-xs font-medium">
              <Icon icon={Loader2} size={14} className="animate-spin text-accent" />
              <span>Preparing build environment…</span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-200"
                style={{ width: percent === null ? "15%" : `${percent}%` }}
              />
            </div>
            <p className="mt-1.5 text-[10px] text-muted-2">
              One-time setup after install. Builds will start automatically when this finishes
              {percent === null ? "." : ` (${percent}%).`}
            </p>
          </>
        ) : (
          <div className="flex items-start gap-2">
            <Icon icon={AlertTriangle} size={14} className="mt-0.5 shrink-0 text-danger" />
            <div className="flex-1 text-xs">
              <div className="font-medium">Build environment setup failed</div>
              <p className="mt-1 text-[10px] text-muted-2 break-words">{state.message}</p>
            </div>
            <button
              type="button"
              className="shrink-0 text-muted-2 hover:text-text"
              onClick={() => setDismissedError(true)}
              aria-label="Dismiss"
            >
              <Icon icon={X} size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
