import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatRefId } from "../../../engine/lib/format.js";
import { parseSavePreview } from "../../../engine/lib/savePreview.js";

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
    <div className="space-y-1.5" style={{ fontFamily: "var(--font-mono)" }}>
      {nodeId && (
        <div className="flex items-baseline gap-2">
          <span
            style={{
              fontSize: "0.52rem",
              letterSpacing: "0.16em",
              color: "rgba(255,109,26,0.3)",
            }}
          >
            {t("save.nodeLabel")}
          </span>
          <span style={{ fontSize: "0.65rem", color: "var(--color-muted-2)" }}>{nodeId}</span>
        </div>
      )}
      {inventory.length > 0 && (
        <div className="flex items-baseline gap-2 flex-wrap">
          <span
            style={{
              fontSize: "0.52rem",
              letterSpacing: "0.16em",
              color: "rgba(255,109,26,0.3)",
            }}
          >
            {t("save.carryLabel")}
          </span>
          {inventory.map(([key, count]) => (
            <span key={key} style={{ fontSize: "0.6rem", color: "var(--color-muted-2)" }}>
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
              color: "rgba(0,189,212,0.3)",
            }}
          >
            {t("save.memLabel")}
          </span>
          {flags.map((key) => (
            <span key={key} style={{ fontSize: "0.6rem", color: "rgba(0,189,212,0.45)" }}>
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
              style={{ color: "rgba(255,109,26,0.35)", fontFamily: "var(--font-mono)" }}
            >
              {t("save.checkpoint")}
            </p>
            <CopyButton text={savedState} />
          </div>
          <div
            className="p-3"
            style={{
              background: "rgba(255,109,26,0.03)",
              border: "1px solid rgba(255,109,26,0.08)",
              borderLeft: "2px solid rgba(255,109,26,0.2)",
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
          style={{ color: "rgba(255,109,26,0.35)", fontFamily: "var(--font-mono)" }}
        >
          {t("save.pasteLabel")}
        </label>
        <textarea
          id="restore-json"
          className="w-full min-h-24 p-3 text-xs resize-y"
          style={{
            fontFamily: "var(--font-mono)",
            color: "var(--color-text)",
            background: "var(--input-bg)",
            border: "1px solid var(--input-border)",
            outline: "none",
            lineHeight: "1.65",
            transition: "border-color 0.15s ease",
          }}
          value={restoreText}
          onChange={(e) => setRestoreText(e.target.value)}
          placeholder={t("save.pastePlaceholder")}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "var(--input-border-focus)";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "var(--input-border)";
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
