import {
  createContext,
  createElement,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { fetchUserPrefs, saveUserPrefs, type UserPrefs } from "@/lib/userPrefs.js";

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
  const [pendingSave, setPendingSave] = useState<Partial<UserPrefs> | null>(null);

  useEffect(() => {
    fetchUserPrefs().then((loaded) => {
      setPrefs(loaded);
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (!pendingSave) return;
    const timer = setTimeout(() => {
      void saveUserPrefs(pendingSave);
      setPendingSave(null);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [pendingSave]);

  const updatePrefs = useCallback((patch: Partial<UserPrefs>) => {
    setPrefs((prev) => ({ ...prev, ...patch }));
    setPendingSave((prev) => ({ ...prev, ...patch }));
  }, []);

  const value = useMemo(() => ({ prefs, ready, updatePrefs }), [prefs, ready, updatePrefs]);

  return createElement(UserPrefsContext.Provider, { value }, children);
}

export function useUserPrefs(): UserPrefsContextValue {
  const ctx = use(UserPrefsContext);
  if (!ctx) {
    throw new Error("useUserPrefs must be used within UserPrefsProvider");
  }
  return ctx;
}
