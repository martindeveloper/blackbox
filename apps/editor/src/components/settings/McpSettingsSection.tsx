import { Check, Copy, History, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { McpAuditEntry, McpAuditResult, McpStatus } from "../../types/electron.js";
import { Button } from "../ui/Button.js";
import { Checkbox } from "../ui/Checkbox.js";

export function McpSettingsSection({
  status,
  onStatusChange,
  onOpenAudit,
}: {
  status: McpStatus | null;
  onStatusChange: (status: McpStatus) => void;
  onOpenAudit: () => void;
}) {
  const { t } = useTranslation();
  const [serverBusy, setServerBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function toggle(enabled: boolean) {
    if (!window.electronAPI || serverBusy) return;
    setServerBusy(true);
    setError(null);
    try {
      onStatusChange(await window.electronAPI.setMcpEnabled(enabled));
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setServerBusy(false);
    }
  }

  async function copyConfig() {
    if (!status?.config) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(status.config, null, 2));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  return (
    <section className="user-settings-section user-settings-mcp">
      <header className="user-settings-section-head">
        <span className="user-settings-section-kicker">{t("settings.agentsKicker")}</span>
        <div className="user-settings-title-row">
          <h3 className="user-settings-section-title">{t("settings.mcpTitle")}</h3>
          <div className="user-settings-mcp-actions">
            <Button variant="ghost" size="sm" leadingIcon={History} onClick={onOpenAudit}>
              {t("settings.mcpAudit")}
            </Button>
            <span
              className={`user-settings-service-state${status?.enabled ? " user-settings-service-state--online" : ""}`}
            >
              <span aria-hidden="true" />
              {status?.enabled ? t("settings.mcpRunning") : t("settings.mcpStopped")}
            </span>
          </div>
        </div>
        <p className="user-settings-section-copy">{t("settings.mcpHint")}</p>
      </header>

      <div className="user-settings-mcp-toggle">
        <Checkbox
          checked={status?.enabled ?? false}
          disabled={!status || serverBusy}
          onChange={(event) => void toggle(event.target.checked)}
          label={serverBusy ? t("settings.mcpUpdating") : t("settings.mcpEnable")}
        />
        <span>{t("settings.mcpLocalOnly")}</span>
      </div>

      {status?.config ? (
        <McpConnection status={status} copied={copied} onCopy={copyConfig} />
      ) : null}
      {error ? <p className="user-settings-mcp-error">{error}</p> : null}
    </section>
  );
}

function McpConnection({
  status,
  copied,
  onCopy,
}: {
  status: McpStatus;
  copied: boolean;
  onCopy: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="user-settings-mcp-details">
      <div className="user-settings-mcp-overview">
        <div className="user-settings-mcp-fields">
          <McpField label={t("settings.mcpEndpoint")} value={status.endpoint} />
          <McpField label={t("settings.mcpToken")} value={status.token} />
        </div>
        <ol className="user-settings-mcp-steps">
          <li>{t("settings.mcpStepOne")}</li>
          <li>{t("settings.mcpStepTwo")}</li>
          <li>{t("settings.mcpStepThree")}</li>
        </ol>
      </div>
      <div className="user-settings-mcp-config-panel">
        <div className="user-settings-mcp-config-head">
          <div>
            <strong>{t("settings.mcpConnectTitle")}</strong>
            <span>{t("settings.mcpConnectHint")}</span>
          </div>
          <Button variant="ghost" size="sm" leadingIcon={copied ? Check : Copy} onClick={onCopy}>
            {copied ? t("settings.mcpCopied") : t("settings.mcpCopy")}
          </Button>
        </div>
        <pre className="user-settings-mcp-config">{JSON.stringify(status.config, null, 2)}</pre>
      </div>
    </div>
  );
}

function McpField({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="user-settings-mcp-field">
      <span>{label}</span>
      <code>{value}</code>
    </div>
  );
}

export function McpAuditSection() {
  const { t } = useTranslation();
  const [audit, setAudit] = useState<McpAuditResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!window.electronAPI || loading) return;
    setLoading(true);
    setError(null);
    try {
      setAudit(await window.electronAPI.getMcpAudit(50));
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    void window.electronAPI
      ?.getMcpAudit(50)
      .then(
        (value) => {
          if (!cancelled) setAudit(value);
        },
        (reason) => {
          if (!cancelled) setError(errorMessage(reason));
        },
      )
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="user-settings-section user-settings-audit-view">
      <div className="user-settings-audit-head">
        <div>
          <span className="user-settings-section-kicker">{t("settings.agentsKicker")}</span>
          <h3 className="user-settings-section-title">{t("settings.mcpAuditTitle")}</h3>
          <p className="user-settings-section-copy">{t("settings.mcpAuditHint")}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          leadingIcon={RefreshCw}
          disabled={loading}
          onClick={() => void load()}
        >
          {loading ? t("settings.mcpAuditLoading") : t("common.refresh")}
        </Button>
      </div>
      <div className="user-settings-audit">
        {audit?.entries.length ? (
          <div className="user-settings-audit-list">
            {audit.entries.map((entry, index) => (
              <div
                className="user-settings-audit-row"
                key={`${entry.timestamp}-${entry.tool ?? entry.operation}-${index}`}
              >
                <time dateTime={entry.timestamp}>{formatTime(entry.timestamp)}</time>
                <span className="user-settings-audit-operation">{formatOperation(entry)}</span>
                <span className="user-settings-audit-client">{formatClient(entry)}</span>
                <span
                  className={`user-settings-audit-outcome user-settings-audit-outcome--${entry.outcome}`}
                >
                  {entry.outcome}
                  {entry.durationMs === undefined ? "" : ` · ${entry.durationMs}ms`}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="user-settings-audit-empty">
            {loading ? t("settings.mcpAuditLoading") : t("settings.mcpAuditEmpty")}
          </p>
        )}
        {error ? <p className="user-settings-mcp-error">{error}</p> : null}
        {audit?.path ? (
          <p className="user-settings-audit-path">
            {t("settings.mcpAuditStored")} <code>{audit.path}</code>
          </p>
        ) : null}
      </div>
    </section>
  );
}

function formatOperation(entry: McpAuditEntry) {
  if (entry.type === "service") return entry.operation ?? "service";
  const args = entry.arguments ?? {};
  const context = [args.projectId, args.chapterId, args.nodeId].filter(
    (value): value is string => typeof value === "string",
  );
  return context.length ? `${entry.tool} · ${context.join(" / ")}` : (entry.tool ?? "tool");
}

function formatClient(entry: McpAuditEntry) {
  if (!entry.client) return "Blackbox Editor";
  return [entry.client.name, entry.client.version].filter(Boolean).join(" ");
}

function formatTime(timestamp: string) {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime())
    ? timestamp
    : date.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
      });
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
