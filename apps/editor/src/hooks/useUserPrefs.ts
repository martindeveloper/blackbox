import {
  createContext,
  createElement,
  use,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { fetchUserPrefs, saveUserPrefs, type UserPrefs } from "../lib/userPrefs.js";

const DEBOUNCE_MS = 600;

interface UserPrefsContextValue {
  prefs: UserPrefs;
  ready: boolean;
  updatePrefs: (patch: Partial<UserPrefs>) => void;
}

const UserPrefsContext = createContext<UserPrefsContextValue | null>(null);

export function UserPrefsProvider({ children }: { children: ReactNode }) {
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

  return createElement(
    UserPrefsContext.Provider,
    { value: { prefs, ready, updatePrefs } },
    children,
  );
}

export function useUserPrefs(): UserPrefsContextValue {
  const ctx = use(UserPrefsContext);
  if (!ctx) {
    throw new Error("useUserPrefs must be used within UserPrefsProvider");
  }
  return ctx;
}
