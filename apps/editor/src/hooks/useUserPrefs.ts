import { useCallback, useEffect, useRef, useState } from "react";
import { fetchUserPrefs, saveUserPrefs, type UserPrefs } from "../lib/userPrefs.js";

const DEBOUNCE_MS = 600;

export function useUserPrefs(): {
  prefs: UserPrefs;
  ready: boolean;
  updatePrefs: (patch: Partial<UserPrefs>) => void;
} {
  const [prefs, setPrefs] = useState<UserPrefs>({});
  const [ready, setReady] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPatch = useRef<Partial<UserPrefs>>({});

  useEffect(() => {
    fetchUserPrefs().then((loaded) => {
      setPrefs(loaded);
      setReady(true);
    });
  }, []);

  const updatePrefs = useCallback((patch: Partial<UserPrefs>) => {
    setPrefs((prev) => ({ ...prev, ...patch }));

    pendingPatch.current = { ...pendingPatch.current, ...patch };

    if (debounceTimer.current !== null) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      void saveUserPrefs(pendingPatch.current);
      pendingPatch.current = {};
      debounceTimer.current = null;
    }, DEBOUNCE_MS);
  }, []);

  return { prefs, ready, updatePrefs };
}
