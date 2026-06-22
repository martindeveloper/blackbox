import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { ModalShell } from "@/components/overlay/ModalShell.js";
import { Button } from "@/components/ui/Button.js";
import {
  registerModalApi,
  type AlertModalOptions,
  type ConfirmModalOptions,
  type ModalVariant,
} from "@/lib/modalApi.js";

interface ModalContextValue {
  confirm: (options: ConfirmModalOptions) => Promise<boolean | null>;
  alert: (options: AlertModalOptions) => Promise<void>;
}

const ModalContext = createContext<ModalContextValue | null>(null);

type QueuedModal =
  | {
      kind: "confirm";
      id: string;
      options: ConfirmModalOptions;
      resolve: (value: boolean | null) => void;
    }
  | {
      kind: "alert";
      id: string;
      options: AlertModalOptions;
      resolve: () => void;
    };

const confirmVariant = (variant?: ModalVariant) => variant ?? "default";

export function ModalProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [queue, setQueue] = useState<QueuedModal[]>([]);

  const confirm = useCallback(
    (options: ConfirmModalOptions) =>
      new Promise<boolean | null>((resolve) => {
        setQueue((prev) => [
          ...prev,
          { kind: "confirm", id: crypto.randomUUID(), options, resolve },
        ]);
      }),
    [],
  );

  const alert = useCallback(
    (options: AlertModalOptions) =>
      new Promise<void>((resolve) => {
        setQueue((prev) => [...prev, { kind: "alert", id: crypto.randomUUID(), options, resolve }]);
      }),
    [],
  );

  const api = useMemo(() => ({ confirm, alert }), [confirm, alert]);

  useEffect(() => {
    registerModalApi(api);
    return () => registerModalApi(null);
  }, [api]);

  const current = queue[0] ?? null;

  const dismissCurrent = (result: boolean | null) => {
    if (!current) return;
    if (current.kind === "confirm") current.resolve(result);
    else current.resolve();
    setQueue((prev) => prev.slice(1));
  };

  const dismissConfirmClose = () => {
    if (current?.kind !== "confirm") return;
    dismissCurrent(current.options.closeAborts ? null : false);
  };

  return (
    <ModalContext.Provider value={api}>
      {children}
      {current?.kind === "confirm" ? (
        <ModalShell
          title={current.options.title}
          onClose={dismissConfirmClose}
          footer={
            <>
              <Button variant="ghost" onClick={() => dismissCurrent(false)}>
                {current.options.cancelLabel ?? t("common.cancel")}
              </Button>
              <Button
                variant={
                  confirmVariant(current.options.variant) === "danger" ? "danger" : "primary"
                }
                onClick={() => dismissCurrent(true)}
              >
                {current.options.confirmLabel ?? t("common.confirm")}
              </Button>
            </>
          }
        >
          <p className="modal-panel-message">{current.options.message}</p>
        </ModalShell>
      ) : null}
      {current?.kind === "alert" ? (
        <ModalShell
          title={current.options.title}
          onClose={() => dismissCurrent(true)}
          footer={
            <Button variant="primary" onClick={() => dismissCurrent(true)}>
              {current.options.confirmLabel ?? t("common.ok")}
            </Button>
          }
        >
          <p className="modal-panel-message">{current.options.message}</p>
        </ModalShell>
      ) : null}
    </ModalContext.Provider>
  );
}

export function useModal(): ModalContextValue {
  const ctx = use(ModalContext);
  if (!ctx) throw new Error("useModal must be used within ModalProvider");
  return ctx;
}
