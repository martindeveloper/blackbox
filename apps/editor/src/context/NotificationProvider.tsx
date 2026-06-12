import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { NotificationToast } from "../components/overlay/NotificationToast.js";
import { registerNotifyApi, type NotificationType, type NotifyOptions } from "../lib/notifyApi.js";

interface NotificationEntry {
  id: string;
  message: string;
  type: NotificationType;
  duration: number;
}

interface NotificationContextValue {
  notify: (options: NotifyOptions) => string;
  dismiss: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

const DEFAULT_DURATION = 5200;

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<NotificationEntry[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const notify = useCallback(
    (options: NotifyOptions) => {
      const id = crypto.randomUUID();
      const entry: NotificationEntry = {
        id,
        message: options.message,
        type: options.type ?? "info",
        duration: options.duration ?? DEFAULT_DURATION,
      };

      setItems((prev) => [...prev, entry]);

      const timer = setTimeout(() => dismiss(id), entry.duration);
      timers.current.set(id, timer);

      return id;
    },
    [dismiss],
  );

  const api = useMemo(() => ({ push: notify, dismiss }), [notify, dismiss]);

  useEffect(() => {
    registerNotifyApi(api);
    const timerMap = timers.current;
    return () => {
      if (!timerMap) return;
      for (const timer of timerMap.values()) clearTimeout(timer);
      timerMap.clear();
      registerNotifyApi(null);
    };
  }, [api]);

  return (
    <NotificationContext.Provider value={{ notify, dismiss }}>
      {children}
      <div className="notification-host" aria-live="polite" aria-relevant="additions">
        {items.map((item) => (
          <NotificationToast
            key={item.id}
            message={item.message}
            type={item.type}
            onDismiss={() => dismiss(item.id)}
          />
        ))}
      </div>
    </NotificationContext.Provider>
  );
}
