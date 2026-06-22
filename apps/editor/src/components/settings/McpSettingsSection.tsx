import { Check, Copy, Eye, EyeOff, RefreshCw, RotateCw, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useModal } from "../../context/ModalProvider.js";
import { isValidMcpPort, MAX_MCP_PORT, MIN_MCP_PORT } from "../../../shared/mcpConfig.js";
import type { McpAuditEntry, McpAuditResult, McpStatus } from "../../types/electron.js";
import { Button } from "../ui/Button.js";
import { Checkbox } from "../ui/Checkbox.js";

export function McpSettingsSection({
  status,
  onStatusChange,
}: {
  status: McpStatus | null;
  onStatusChange: (status: McpStatus) => void;
}) {
  const { t } = useTranslation();
  const { confirm } = useModal();
  const [serverBusy, setServerBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [tokenVisible, setTokenVisible] = useState(false);
  const [portDraft, setPortDraft] = useState<string | null>(null);
  const port = portDraft ?? (status ? String(status.port) : "");

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

  async function savePort() {
    if (!window.electronAPI || serverBusy) return;
    const value = Number(port);
    if (!isValidMcpPort(value)) {
      setError(t("settings.mcpPortInvalid"));
      return;
    }
    setServerBusy(true);
    setError(null);
    try {
      onStatusChange(await window.electronAPI.setMcpPort(value));
      setPortDraft(null);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setServerBusy(false);
    }
  }

  async function regenerateToken() {
    if (!window.electronAPI || serverBusy) return;
    const approved = await confirm({
      title: t("settings.mcpRegenerateTitle"),
      message: t("settings.mcpRegenerateMessage"),
      confirmLabel: t("settings.mcpRegenerate"),
      variant: "danger",
    });
    if (!approved) return;
    setServerBusy(true);
    setError(null);
    try {
      onStatusChange(await window.electronAPI.regenerateMcpToken());
      setTokenVisible(false);
      setCopied(false);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setServerBusy(false);
    }
  }

  const parsedPort = Number(port);
  const portValid = isValidMcpPort(parsedPort);
  const portChanged = status ? parsedPort !== status.port : false;

  return (
    <section className="user-settings-section user-settings-mcp">
      <header className="user-settings-section-head">
        <span className="user-settings-section-kicker">{t("settings.agentsKicker")}</span>
        <div className="user-settings-title-row">
          <h3 className="user-settings-section-title">{t("settings.mcpTitle")}</h3>
          <div className="user-settings-mcp-actions">
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

      <div className="user-settings-mcp-port">
        <label htmlFor="mcp-port">
          <strong>{t("settings.mcpPort")}</strong>
          <span>{t("settings.mcpPortHint")}</span>
        </label>
        <div>
          <input
            id="mcp-port"
            className="editor-input"
            type="number"
            min={MIN_MCP_PORT}
            max={MAX_MCP_PORT}
            step={1}
            value={port}
            disabled={!status || serverBusy}
            aria-invalid={!portValid}
            onChange={(event) => setPortDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void savePort();
            }}
          />
          <Button
            size="sm"
            leadingIcon={Save}
            disabled={!status || serverBusy || !portValid || !portChanged}
            onClick={() => void savePort()}
          >
            {t("settings.mcpPortApply")}
          </Button>
        </div>
      </div>

      {status?.config ? (
        <McpConnection
          status={status}
          copied={copied}
          busy={serverBusy}
          tokenVisible={tokenVisible}
          onCopy={copyConfig}
          onToggleToken={() => setTokenVisible((visible) => !visible)}
          onRegenerate={() => void regenerateToken()}
        />
      ) : null}
      {error || status?.error ? (
        <p className="user-settings-mcp-error">{error ?? status?.error}</p>
      ) : null}
    </section>
  );
}

function McpConnection({
  status,
  copied,
  busy,
  tokenVisible,
  onCopy,
  onToggleToken,
  onRegenerate,
}: {
  status: McpStatus;
  copied: boolean;
  busy: boolean;
  tokenVisible: boolean;
  onCopy: () => void;
  onToggleToken: () => void;
  onRegenerate: () => void;
}) {
  const { t } = useTranslation();
  const visibleToken = tokenVisible ? status.token : maskToken(status.token);
  const visibleConfig =
    tokenVisible || !status.config
      ? status.config
      : {
          ...status.config,
          mcpServers: {
            ...status.config.mcpServers,
            "blackbox-editor": {
              ...status.config.mcpServers["blackbox-editor"],
              headers: { Authorization: `Bearer ${maskToken(status.token)}` },
            },
          },
        };
  return (
    <div className="user-settings-mcp-details">
      <div className="user-settings-mcp-overview">
        <div className="user-settings-mcp-fields">
          <McpField label={t("settings.mcpEndpoint")} value={status.endpoint} />
          <div className="user-settings-mcp-secret">
            <McpField label={t("settings.mcpToken")} value={visibleToken} />
            <Button
              variant="ghost"
              size="sm"
              leadingIcon={tokenVisible ? EyeOff : Eye}
              onClick={onToggleToken}
            >
              {tokenVisible ? t("settings.mcpHideToken") : t("settings.mcpShowToken")}
            </Button>
          </div>
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
        <pre className="user-settings-mcp-config">{JSON.stringify(visibleConfig, null, 2)}</pre>
        <div className="user-settings-mcp-credential-actions">
          <span>{t("settings.mcpPersistentTokenHint")}</span>
          <Button
            variant="danger"
            size="sm"
            leadingIcon={RotateCw}
            disabled={busy}
            onClick={onRegenerate}
          >
            {t("settings.mcpRegenerate")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function maskToken(token: string | null) {
  return token ? "••••••••••••••••••••••••••••••••" : null;
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

  const firstDetailedEntry = audit?.entries.findIndex((entry) => entry.changes?.length) ?? -1;

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
                <div className="user-settings-audit-row-main">
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
                {entry.changes?.length ? (
                  <details
                    className="user-settings-audit-changes"
                    defaultOpen={index === firstDetailedEntry}
                  >
                    <summary>
                      {t("settings.mcpAuditChanges", {
                        count: entry.changeCount ?? entry.changes.length,
                      })}
                      {entry.revision ? ` · revision ${entry.revision}` : ""}
                    </summary>
                    <ul>
                      {entry.changes.map((change, changeIndex) => (
                        <li key={`${change.action}-${change.entity}-${change.id}-${changeIndex}`}>
                          <span
                            className={`user-settings-audit-change-action user-settings-audit-change-action--${change.action}`}
                          >
                            {change.action}
                          </span>
                          <span>{change.entity}</span>
                          <code>{change.id}</code>
                          {change.parentId ? (
                            <small>
                              in {change.parentId}
                              {change.chapterId ? ` · ${change.chapterId}` : ""}
                            </small>
                          ) : change.chapterId ? (
                            <small>in {change.chapterId}</small>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                    {entry.changesTruncated ? (
                      <p>{t("settings.mcpAuditChangesTruncated")}</p>
                    ) : null}
                  </details>
                ) : null}
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
