import { CircleHelp, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/Button.js";
import { Icon } from "../icons/Icon.js";

const ROUTE_KINDS = [
  { kind: "goto", labelKey: "graph.help.direct" },
  { kind: "checkSuccess", labelKey: "graph.help.success" },
  { kind: "checkFailure", labelKey: "graph.help.failure" },
  { kind: "checkExhausted", labelKey: "graph.help.exhausted" },
  { kind: "gotoChapter", labelKey: "graph.help.chapter" },
  { kind: "itemAction", labelKey: "graph.help.item" },
] as const;

const SHORTCUTS = [
  { keys: ["N"], labelKey: "graph.help.shortcuts.addNode" },
  { keys: ["C"], labelKey: "graph.help.shortcuts.addChoice" },
  { keys: ["⌫"], labelKey: "graph.help.shortcuts.deleteNode" },
  { keys: ["L"], labelKey: "graph.help.shortcuts.arrange" },
  { keys: ["F"], labelKey: "graph.help.shortcuts.fit" },
  { keys: ["H"], labelKey: "graph.help.shortcuts.analytics" },
  { keys: ["⌘", "Z"], labelKey: "graph.help.shortcuts.undo" },
  { keys: ["⌘", "⇧", "Z"], labelKey: "graph.help.shortcuts.redo" },
  { keys: ["Esc"], labelKey: "graph.help.shortcuts.deselect" },
  { keys: ["?"], labelKey: "graph.help.shortcuts.help" },
] as const;

function isTextEntry(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

export function GraphHelp() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as globalThis.Node)) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  useEffect(() => {
    const toggleOnQuestionMark = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key !== "?" || isTextEntry(event.target)) return;
      event.preventDefault();
      setOpen((value) => !value);
    };
    window.addEventListener("keydown", toggleOnQuestionMark);
    return () => window.removeEventListener("keydown", toggleOnQuestionMark);
  }, []);

  return (
    <div className="graph-help" ref={rootRef}>
      <Button
        variant="ghost"
        size="sm"
        icon
        leadingIcon={CircleHelp}
        aria-label={t("graph.help.open")}
        aria-expanded={open}
        aria-controls="graph-help-popover"
        title={`${t("graph.help.open")} (?)`}
        onClick={() => setOpen((value) => !value)}
      />
      {open ? (
        <div
          id="graph-help-popover"
          className="graph-help-popover"
          role="dialog"
          aria-label={t("graph.help.title")}
        >
          <div className="graph-help-header">
            <div>
              <div className="graph-help-kicker">{t("graph.help.kicker")}</div>
              <div className="graph-help-title">{t("graph.help.title")}</div>
            </div>
            <button
              type="button"
              className="graph-help-close"
              aria-label={t("graph.help.close")}
              onClick={() => setOpen(false)}
            >
              <Icon icon={X} size={12} />
            </button>
          </div>

          <div className="graph-help-routes">
            {ROUTE_KINDS.map(({ kind, labelKey }) => (
              <div className="graph-help-route" key={kind}>
                <span className={`graph-help-line graph-help-line--${kind}`} aria-hidden="true">
                  <span />
                </span>
                <span>{t(labelKey)}</span>
              </div>
            ))}
          </div>

          <div className="graph-help-note">
            <span className="graph-help-port" aria-hidden="true" />
            <span>{t("graph.help.direction")}</span>
          </div>
          <div className="graph-help-note">{t("graph.help.parallel")}</div>
          <div className="graph-help-note">{t("graph.help.labels")}</div>

          <div className="graph-help-section">
            <div className="graph-help-kicker">{t("graph.help.shortcuts.kicker")}</div>
            <dl className="graph-help-shortcuts">
              {SHORTCUTS.map(({ keys, labelKey }) => (
                <div className="graph-help-shortcut" key={labelKey}>
                  <dt>
                    {keys.map((key, i) => (
                      <kbd key={i}>{key}</kbd>
                    ))}
                  </dt>
                  <dd>{t(labelKey)}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      ) : null}
    </div>
  );
}
