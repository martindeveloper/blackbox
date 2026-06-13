import { useState } from "react";
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
    <button type="button" className="sys-btn save-panel__copy" onClick={handleCopy}>
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
    <div className="save-summary">
      {nodeId && (
        <div className="save-summary__row">
          <span className="save-summary__label">{t("save.nodeLabel")}</span>
          <span className="save-summary__value">{nodeId}</span>
        </div>
      )}
      {inventory.length > 0 && (
        <div className="save-summary__row">
          <span className="save-summary__label">{t("save.carryLabel")}</span>
          {inventory.map(([key, count]) => (
            <span key={key} className="save-summary__value">
              {formatRefId(key)} {count > 1 ? `×${count}` : ""}
            </span>
          ))}
        </div>
      )}
      {flags.length > 0 && (
        <div className="save-summary__row">
          <span className="save-summary__label save-summary__label--info">
            {t("save.memLabel")}
          </span>
          {flags.map((key) => (
            <span key={key} className="save-summary__value save-summary__value--info">
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
  const [restoreText, setRestoreText] = useState("");

  function handleRestore() {
    if (restoreText.trim()) {
      onRestore(restoreText.trim());
      onClose();
    }
  }

  return (
    <div className="save-panel">
      {savedState && (
        <section className="save-panel__section">
          <div className="save-panel__section-head">
            <h3 className="save-panel__section-title">{t("save.checkpoint")}</h3>
            <CopyButton text={savedState} />
          </div>
          <div className="save-panel__checkpoint">
            <SaveSummary json={savedState} />
          </div>
        </section>
      )}

      <section className="save-panel__section save-panel__section--import">
        <label
          htmlFor="restore-json"
          className="save-panel__section-title save-panel__import-label"
        >
          {t("save.pasteLabel")}
        </label>
        <textarea
          id="restore-json"
          className="save-panel__textarea"
          value={restoreText}
          onChange={(e) => setRestoreText(e.target.value)}
          placeholder={t("save.pastePlaceholder")}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
      </section>

      <button
        type="button"
        className="choice-item save-panel__restore"
        disabled={!restoreText.trim()}
        onClick={handleRestore}
      >
        <span className="choice-num">[→]</span>
        <span>{t("save.restoreBtn")}</span>
      </button>
    </div>
  );
}
