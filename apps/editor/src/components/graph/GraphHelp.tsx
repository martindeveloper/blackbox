import { CircleHelp, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button.js";
import { Icon } from "@/components/icons/Icon.js";
import {
  GRAPH_HELP_SHORTCUTS,
  matchesShortcut,
  shortcutTitle,
  SHORTCUTS,
  formatShortcutVariants,
  type ShortcutAction,
} from "@/lib/shortcuts.js";

const ROUTE_KINDS = [
  { kind: "goto", labelKey: "graph.help.direct" },
  { kind: "checkSuccess", labelKey: "graph.help.success" },
  { kind: "checkFailure", labelKey: "graph.help.failure" },
  { kind: "checkExhausted", labelKey: "graph.help.exhausted" },
  { kind: "gotoChapter", labelKey: "graph.help.chapter" },
  { kind: "itemAction", labelKey: "graph.help.item" },
] as const;

function isTextEntry(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

function ShortcutKeys({ action }: { action: ShortcutAction }) {
  const variants = formatShortcutVariants(action);
  return (
    <>
      {variants.map((keys, variantIndex) => (
        <span key={variantIndex}>
          {variantIndex > 0 ? " / " : null}
          {keys.map((key, keyIndex) => (
            <kbd key={keyIndex}>{key}</kbd>
          ))}
        </span>
      ))}
    </>
  );
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
      if (matchesShortcut(event, "graphDeselect")) setOpen(false);
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
      if (!matchesShortcut(event, "graphHelp") || isTextEntry(event.target)) return;
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
        title={shortcutTitle(t("graph.help.open"), "graphHelp")}
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
              {GRAPH_HELP_SHORTCUTS.map((action) => (
                <div className="graph-help-shortcut" key={action}>
                  <dt>
                    <ShortcutKeys action={action} />
                  </dt>
                  <dd>{t(SHORTCUTS[action].titleKey)}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      ) : null}
    </div>
  );
}
