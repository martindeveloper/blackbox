import { isEditableTarget } from "../../../engine/lib/keyboard.js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ModalShell, type ModalSize, type ModalTone } from "../components/modal/ModalShell.js";

export type { ModalSize };

export interface ModalDescriptor {
  id: string;
  title: ReactNode;
  eyebrow?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  tone?: ModalTone;
  accentColor?: string;
  size?: ModalSize;
  dismissOnBackdrop?: boolean;
  showClose?: boolean;
  onClose?: () => void;
}

interface ModalContextValue {
  openModal: (descriptor: ModalDescriptor) => void;
  closeModal: (id: string) => void;
  closeTopModal: () => void;
  hasOpenModals: () => boolean;
}

const ModalContext = createContext<ModalContextValue | null>(null);

function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [locked]);
}

export function ModalProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<ModalDescriptor[]>([]);
  const stackRef = useRef<ModalDescriptor[]>([]);
  stackRef.current = stack;

  const openModal = useCallback((descriptor: ModalDescriptor) => {
    setStack((current) => {
      const existingIdx = current.findIndex((entry) => entry.id === descriptor.id);
      if (existingIdx !== -1) {
        return current.map((entry, i) => (i === existingIdx ? descriptor : entry));
      }
      return [...current, descriptor];
    });
  }, []);

  const closeModal = useCallback((id: string) => {
    const currentStack = stackRef.current;
    const target = currentStack.find((entry) => entry.id === id);
    if (!target) return;

    const nextStack = currentStack.filter((entry) => entry.id !== id);
    stackRef.current = nextStack;
    setStack(nextStack);
    target?.onClose?.();
  }, []);

  const closeTopModal = useCallback(() => {
    const currentStack = stackRef.current;
    const top = currentStack.at(-1);
    if (!top) return;

    const nextStack = currentStack.slice(0, -1);
    stackRef.current = nextStack;
    setStack(nextStack);
    top?.onClose?.();
  }, []);

  const hasOpenModals = useCallback(() => stackRef.current.length > 0, []);

  const value = useMemo(
    () => ({ openModal, closeModal, closeTopModal, hasOpenModals }),
    [openModal, closeModal, closeTopModal, hasOpenModals],
  );

  useBodyScrollLock(stack.length > 0);

  useEffect(() => {
    if (!stack.length) return;

    function handleKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (isEditableTarget(event.target)) {
        return;
      }
      event.preventDefault();
      closeTopModal();
    }

    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [stack.length, closeTopModal]);

  return (
    <ModalContext.Provider value={value}>
      {children}
      {stack.map((modal, index) => (
        <ModalShell
          key={modal.id}
          title={modal.title}
          eyebrow={modal.eyebrow}
          icon={modal.icon}
          tone={modal.tone}
          accentColor={modal.accentColor}
          size={modal.size}
          dismissOnBackdrop={modal.dismissOnBackdrop ?? true}
          enableEscape={false}
          showClose={modal.showClose ?? true}
          layer={index}
          onClose={() => closeModal(modal.id)}
        >
          {modal.children}
        </ModalShell>
      ))}
    </ModalContext.Provider>
  );
}

export function useModal(): ModalContextValue {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error("useModal must be used within ModalProvider");
  }
  return context;
}
