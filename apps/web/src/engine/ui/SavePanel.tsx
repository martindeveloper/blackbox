import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatRefId } from "../lib/format.js";
import { parseSavePreview } from "../lib/savePreview.js";

interface SavePanelProps {
  savedState: string | null;
  onRestore: (stateJson: string) => void;
  onClose: () => void;
}

function CopyButton({ text }: { text: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  return (
    <button
      type="button"
      className="sys-btn"
      onClick={handleCopy}
      style={{ fontSize: "0.6rem", padding: "0.3rem 0.6rem" }}
    >
      {copied ? t("save.copied") : t("save.copy")}
    </button>
  );
}

function SaveSummary({ json }: { json: string }) {
  const { t } = useTranslation();
  const preview = parseSavePreview(json);
  if (!preview) return null;

  const { nodeId, inventory, flags } = preview;

  return (
    <div className="space-y-1.5" style={{ fontFamily: "var(--bb-font-mono)" }}>
      {nodeId && (
        <div className="flex items-baseline gap-2">
          <span
            style={{
              fontSize: "0.52rem",
              letterSpacing: "0.16em",
              color: "color-mix(in srgb, var(--bb-ui-accent) 30%, transparent)",
            }}
          >
            {t("save.nodeLabel")}
          </span>
          <span style={{ fontSize: "0.65rem", color: "var(--bb-ui-muted)" }}>{nodeId}</span>
        </div>
      )}
      {inventory.length > 0 && (
        <div className="flex items-baseline gap-2 flex-wrap">
          <span
            style={{
              fontSize: "0.52rem",
              letterSpacing: "0.16em",
              color: "color-mix(in srgb, var(--bb-ui-accent) 30%, transparent)",
            }}
          >
            {t("save.carryLabel")}
          </span>
          {inventory.map(([key, count]) => (
            <span key={key} style={{ fontSize: "0.6rem", color: "var(--bb-ui-muted)" }}>
              {formatRefId(key)} {count > 1 ? `×${count}` : ""}
            </span>
          ))}
        </div>
      )}
      {flags.length > 0 && (
        <div className="flex items-baseline gap-2 flex-wrap">
          <span
            style={{
              fontSize: "0.52rem",
              letterSpacing: "0.16em",
              color: "color-mix(in srgb, var(--bb-ui-info) 30%, transparent)",
            }}
          >
            {t("save.memLabel")}
          </span>
          {flags.map((key) => (
            <span
              key={key}
              style={{
                fontSize: "0.6rem",
                color: "color-mix(in srgb, var(--bb-ui-info) 45%, transparent)",
              }}
            >
              {formatRefId(key)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function SavePanel({ savedState, onRestore, onClose }: SavePanelProps) {
  const { t } = useTranslation();
  const [restoreText, setRestoreText] = useState(savedState ?? "");

  useEffect(() => {
    setRestoreText(savedState ?? "");
  }, [savedState]);

  function handleRestore() {
    if (restoreText.trim()) {
      onRestore(restoreText.trim());
      onClose();
    }
  }

  return (
    <div className="p-5 space-y-5">
      {savedState && (
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <p
              className="text-xs tracking-[0.2em]"
              style={{
                color: "color-mix(in srgb, var(--bb-ui-accent) 35%, transparent)",
                fontFamily: "var(--bb-font-mono)",
              }}
            >
              {t("save.checkpoint")}
            </p>
            <CopyButton text={savedState} />
          </div>
          <div
            className="p-3"
            style={{
              background: "color-mix(in srgb, var(--bb-ui-accent) 3%, transparent)",
              border: "1px solid color-mix(in srgb, var(--bb-ui-accent) 8%, transparent)",
              borderLeft: "2px solid color-mix(in srgb, var(--bb-ui-accent) 20%, transparent)",
            }}
          >
            <SaveSummary json={savedState} />
          </div>
        </div>
      )}

      <div>
        <label
          htmlFor="restore-json"
          className="block text-xs tracking-[0.2em] mb-2"
          style={{
            color: "color-mix(in srgb, var(--bb-ui-accent) 35%, transparent)",
            fontFamily: "var(--bb-font-mono)",
          }}
        >
          {t("save.pasteLabel")}
        </label>
        <textarea
          id="restore-json"
          className="w-full min-h-24 p-3 text-xs resize-y"
          style={{
            fontFamily: "var(--bb-font-mono)",
            color: "var(--bb-ui-text)",
            background: "var(--bb-input-bg)",
            border: "1px solid var(--bb-input-border)",
            outline: "none",
            lineHeight: "1.65",
            transition: "border-color 0.15s ease",
          }}
          value={restoreText}
          onChange={(e) => setRestoreText(e.target.value)}
          placeholder={t("save.pastePlaceholder")}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "var(--bb-input-border-focus)";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "var(--bb-input-border)";
          }}
        />
      </div>

      <button
        type="button"
        className="choice-item"
        disabled={!restoreText.trim()}
        style={{
          opacity: restoreText.trim() ? 1 : 0.3,
          cursor: restoreText.trim() ? "pointer" : "not-allowed",
        }}
        onClick={handleRestore}
      >
        <span className="choice-num">[→]</span>
        <span>{t("save.restoreBtn")}</span>
      </button>
    </div>
  );
}
