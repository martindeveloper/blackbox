import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { IconButton } from "@/components/ui/IconButton.js";

interface ModalShellProps {
  title?: string;
  labelledBy?: string;
  children: ReactNode;
  footer: ReactNode;
  onClose: () => void;
  dismissOnBackdrop?: boolean;
}

export function ModalShell({
  title,
  labelledBy,
  children,
  footer,
  onClose,
  dismissOnBackdrop = true,
}: ModalShellProps) {
  const { t } = useTranslation();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (dismissOnBackdrop && e.target === e.currentTarget) onClose();
      }}
    >
      <dialog
        open
        className="modal-panel"
        aria-labelledby={labelledBy ?? (title ? "modal-title" : undefined)}
      >
        <div className="modal-panel-header">
          {title ? (
            <h2 id="modal-title" className="modal-panel-title">
              {title}
            </h2>
          ) : null}
          <IconButton
            icon={X}
            className="modal-panel-close"
            title={t("modal.close")}
            onClick={onClose}
          />
        </div>
        <div className="modal-panel-body">{children}</div>
        <div className="modal-panel-footer">{footer}</div>
      </dialog>
    </div>,
    document.body,
  );
}
