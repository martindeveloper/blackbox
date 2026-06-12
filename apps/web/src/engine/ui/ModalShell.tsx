import { useEffect, type CSSProperties, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

export type ModalTone = "amber" | "cyan" | "copper" | "danger" | "dim" | "green";

export type ModalSize = "sm" | "md" | "lg";

interface ModalShellProps {
  title: ReactNode;
  eyebrow?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  tone?: ModalTone;
  accentColor?: string;
  size?: ModalSize;
  dismissOnBackdrop?: boolean;
  enableEscape?: boolean;
  showClose?: boolean;
  layer?: number;
  onClose: () => void;
}

const sizeClass: Record<ModalSize, string> = {
  sm: "modal-panel--sm",
  md: "modal-panel--md",
  lg: "modal-panel--lg",
};

function CloseIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden>
      <line
        x1="2"
        y1="2"
        x2="10"
        y2="10"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <line
        x1="10"
        y1="2"
        x2="2"
        y2="10"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ModalShell({
  title,
  eyebrow,
  icon,
  children,
  tone = "amber",
  accentColor,
  size = "md",
  dismissOnBackdrop = true,
  enableEscape = true,
  showClose = true,
  layer = 0,
  onClose,
}: ModalShellProps) {
  const { t } = useTranslation();
  const bracketTone = accentColor ? "subject" : tone;
  const panelClass = accentColor
    ? `modal-panel modal-panel--subject ${sizeClass[size]}`
    : `modal-panel modal-panel--${tone} ${sizeClass[size]}`;
  const panelStyle = accentColor ? ({ "--modal-accent": accentColor } as CSSProperties) : undefined;

  useEffect(() => {
    if (!enableEscape) return;

    function handleKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    }

    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [enableEscape, onClose]);

  return (
    <div
      className="modal-backdrop"
      style={{ zIndex: 50 + layer }}
      onClick={(event) => {
        if (dismissOnBackdrop && event.target === event.currentTarget) {
          onClose();
        }
      }}
      role="presentation"
    >
      <div
        className={panelClass}
        style={panelStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <span className={`bracket bracket-tl bracket-${bracketTone}`} />
        <span className={`bracket bracket-tr bracket-${bracketTone}`} />
        <span className={`bracket bracket-bl bracket-${bracketTone}`} />
        <span className={`bracket bracket-br bracket-${bracketTone}`} />

        <div className="modal-header">
          <div className="modal-header-main">
            {icon && <span className="modal-icon">{icon}</span>}
            <div className="modal-titles">
              {eyebrow && <div className="modal-eyebrow">{eyebrow}</div>}
              <h2 id="modal-title" className="modal-title">
                {title}
              </h2>
            </div>
          </div>

          {showClose && (
            <button
              type="button"
              className="sys-btn flex items-center gap-1.5"
              onClick={onClose}
              aria-label={t("modal.close")}
            >
              <CloseIcon size={10} />
              <span>{t("modal.esc")}</span>
            </button>
          )}
        </div>

        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
