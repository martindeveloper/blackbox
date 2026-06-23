import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  Clock3,
  FileCheck2,
  GitBranch,
  Loader2,
  RefreshCw,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  configureVcs,
  executeVcsOperation,
  getVcsHistory,
  getVcsStatus,
  type ProjectContributionReview,
  type VcsHistoryEntry,
  type VcsOperation,
  type VcsStatus,
} from "@/lib/projectApi.js";
import { CONTRIBUTION_REVIEW_EVENT } from "@/lib/contributionReview.js";
import { notifyFromError, notifySuccess } from "@/lib/notifyApi.js";
import { Icon } from "@/components/icons/Icon.js";
import { Button } from "@/components/ui/Button.js";
import { Select } from "@/components/ui/Select.js";
import { Textarea } from "@/components/ui/Textarea.js";

interface VcsControlProps {
  projectId: string;
  revision: number | null;
  dirty: boolean;
  onStatusChange?: (status: VcsStatus | null) => void;
}

type Tab = "changes" | "history";
export const VCS_CONTROL_OPEN_EVENT = "blackbox:vcs-control-open";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function operationIcon(operationId: string): LucideIcon {
  if (operationId === "sync") return ArrowDown;
  if (operationId === "publish") return Upload;
  if (operationId === "record") return FileCheck2;
  return RefreshCw;
}

export function VcsControl({ projectId, revision, dirty, onStatusChange }: VcsControlProps) {
  const { t } = useTranslation();
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [status, setStatus] = useState<VcsStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("changes");
  const [message, setMessage] = useState("");
  const [selectedProviderId, setSelectedProviderId] = useState("");
  const [historyPath, setHistoryPath] = useState("");
  const [history, setHistory] = useState<VcsHistoryEntry[]>([]);

  const applyStatus = useCallback(
    (next: VcsStatus | null) => {
      setStatus(next);
      onStatusChange?.(next);
    },
    [onStatusChange],
  );

  const placePopover = () => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (rect) setCoords({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
  };

  const refresh = async (showBusy = false) => {
    if (showBusy) setBusy("refresh");
    try {
      applyStatus(await getVcsStatus(projectId));
    } catch (error) {
      if (showBusy) notifyFromError(error);
    } finally {
      if (showBusy) setBusy(null);
    }
  };

  const loadHistory = async (path = historyPath) => {
    setBusy("history");
    try {
      setHistory(await getVcsHistory(projectId, path || undefined));
    } catch (error) {
      notifyFromError(error);
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    let active = true;
    void getVcsStatus(projectId)
      .then((next) => {
        if (active) applyStatus(next);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [applyStatus, projectId, revision]);

  useEffect(() => {
    const openControl = () => {
      placePopover();
      setOpen(true);
      void refresh();
    };
    window.addEventListener(VCS_CONTROL_OPEN_EVENT, openControl);
    return () => window.removeEventListener(VCS_CONTROL_OPEN_EVENT, openControl);
  });

  useEffect(() => {
    const reviewContribution = (event: Event) => {
      const review = (event as CustomEvent<ProjectContributionReview>).detail;
      if (review.type !== "vcs-diff") return;
      setHistoryPath("");
      setTab("history");
      placePopover();
      setOpen(true);
      setBusy("history");
      void getVcsHistory(projectId)
        .then(setHistory)
        .catch(notifyFromError)
        .finally(() => setBusy(null));
    };
    window.addEventListener(CONTRIBUTION_REVIEW_EVENT, reviewContribution);
    return () => window.removeEventListener(CONTRIBUTION_REVIEW_EVENT, reviewContribution);
  }, [projectId]);

  useLayoutEffect(() => {
    if (!open) return;
    const reposition = () => placePopover();
    window.addEventListener("resize", reposition);
    return () => window.removeEventListener("resize", reposition);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!anchorRef.current?.contains(target) && !(target as Element).closest?.(".vcs-popover")) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const runOperation = async (
    operationId: string,
    operation: VcsOperation,
    payload: { message?: string; paths?: string[] } = {},
  ): Promise<boolean> => {
    setBusy(operationId);
    try {
      const result = await executeVcsOperation(projectId, operationId, payload);
      applyStatus(result.status);
      notifySuccess(operation.successMessage);
      return true;
    } catch (error) {
      notifyFromError(error);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const defaultProvider =
    status?.providers.find((provider) => provider.detected) ?? status?.providers[0];
  const setupProvider =
    status?.providers.find((provider) => provider.id === selectedProviderId) ?? defaultProvider;
  const activeProvider = status?.activeProvider;
  const files = status?.files ?? [];
  const changeCount = files.length;
  const workspace = status?.workspace;
  const providerLabel = activeProvider?.label ?? setupProvider?.label ?? "VCS";
  const operations = Object.entries(activeProvider?.operations ?? {});
  const primaryOperation = operations.find(([, operation]) => operation.placement === "primary");
  const footerOperations = operations.filter(([, operation]) => operation.placement === "footer");
  const fileOperations = operations.filter(([, operation]) => operation.placement === "file");
  const operationState = (operationId: string) => status?.operationStates?.[operationId];

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className={`vcs-trigger${open ? " vcs-trigger--open" : ""}`}
        aria-expanded={open}
        title={t("vcs.title")}
        onClick={() => {
          if (!open) placePopover();
          setOpen((value) => !value);
          if (!open) void refresh();
        }}
      >
        <Icon icon={GitBranch} size={12} />
        <span>{workspace?.label || providerLabel}</span>
        {changeCount > 0 ? <span className="vcs-trigger-count">{changeCount}</span> : null}
        {workspace?.ahead ? (
          <span className="vcs-trigger-sync">
            <Icon icon={ArrowUp} size={9} />
            {workspace.ahead}
          </span>
        ) : null}
        {workspace?.behind ? (
          <span className="vcs-trigger-sync">
            <Icon icon={ArrowDown} size={9} />
            {workspace.behind}
          </span>
        ) : null}
        <Icon icon={ChevronDown} size={10} />
      </button>

      {open && coords
        ? createPortal(
            <section className="vcs-popover" style={coords} aria-label={t("vcs.title")}>
              <header className="vcs-popover-header">
                <div>
                  <strong>{t("vcs.title")}</strong>
                  <span>
                    {status?.configured
                      ? workspace?.label || providerLabel
                      : t("vcs.notConfigured")}
                  </span>
                </div>
                <button
                  type="button"
                  className="vcs-icon-action"
                  title={t("common.refresh")}
                  disabled={busy !== null}
                  onClick={() => void refresh(true)}
                >
                  <Icon
                    icon={busy === "refresh" ? Loader2 : RefreshCw}
                    size={12}
                    className={busy === "refresh" ? "vcs-spin" : undefined}
                  />
                </button>
              </header>

              {!status ? (
                <div className="vcs-loading">
                  <Icon icon={Loader2} className="vcs-spin" size={14} />
                  {t("vcs.loading")}
                </div>
              ) : !status.configured ? (
                <div className="vcs-setup">
                  <Icon icon={GitBranch} size={24} />
                  <strong>
                    {setupProvider?.detected
                      ? t("vcs.connectProvider", { provider: setupProvider.label })
                      : setupProvider?.features.initialize
                        ? t("vcs.initializeProvider", {
                            provider: setupProvider?.label ?? "VCS",
                          })
                        : t("vcs.configureProvider", {
                            provider: setupProvider?.label ?? "VCS",
                          })}
                  </strong>
                  <p>{t("vcs.setupHint", { provider: setupProvider?.label ?? "VCS" })}</p>
                  {status.providers.length > 1 ? (
                    <Select
                      aria-label={t("vcs.provider")}
                      value={setupProvider?.id ?? ""}
                      options={status.providers.map((provider) => ({
                        value: provider.id,
                        label: provider.available
                          ? provider.label
                          : t("vcs.providerUnavailableOption", { provider: provider.label }),
                      }))}
                      onChange={(event) => setSelectedProviderId(event.target.value)}
                    />
                  ) : null}
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={
                      !setupProvider?.available ||
                      (!setupProvider.detected && !setupProvider.features.initialize) ||
                      busy !== null
                    }
                    onClick={() =>
                      void (async () => {
                        if (!setupProvider) return;
                        setBusy("setup");
                        try {
                          applyStatus(
                            await configureVcs(
                              projectId,
                              setupProvider.id,
                              !setupProvider.detected,
                            ),
                          );
                          notifySuccess(t("vcs.configured", { provider: setupProvider.label }));
                        } catch (error) {
                          notifyFromError(error);
                        } finally {
                          setBusy(null);
                        }
                      })()
                    }
                  >
                    {busy === "setup"
                      ? t("vcs.settingUp")
                      : t("vcs.useProvider", { provider: setupProvider?.label ?? "VCS" })}
                  </Button>
                  {!setupProvider?.available ? (
                    <small>
                      {t("vcs.providerNotInstalled", {
                        provider: setupProvider?.label ?? "VCS",
                      })}
                    </small>
                  ) : null}
                </div>
              ) : status.unavailable || status.initialized === false ? (
                <div className="vcs-setup">
                  <strong>{t("vcs.providerUnavailable", { provider: providerLabel })}</strong>
                  <p>{t("vcs.providerUnavailableHint")}</p>
                </div>
              ) : (
                <>
                  <div className="vcs-summary">
                    <span>{workspace?.trackingLabel || t("vcs.noTracking")}</span>
                    {workspace?.ahead !== undefined || workspace?.behind !== undefined ? (
                      <span>
                        {t("vcs.syncSummary", {
                          ahead: workspace.ahead ?? 0,
                          behind: workspace.behind ?? 0,
                        })}
                      </span>
                    ) : null}
                  </div>

                  <nav className="vcs-tabs" aria-label={t("vcs.title")}>
                    <button
                      type="button"
                      className={tab === "changes" ? "active" : ""}
                      onClick={() => setTab("changes")}
                    >
                      {t("vcs.changes")} <span>{changeCount}</span>
                    </button>
                    {activeProvider?.features.history ? (
                      <button
                        type="button"
                        className={tab === "history" ? "active" : ""}
                        onClick={() => {
                          setTab("history");
                          void loadHistory();
                        }}
                      >
                        {t("vcs.history")}
                      </button>
                    ) : null}
                  </nav>

                  {tab === "changes" ? (
                    <>
                      <div className="vcs-file-list">
                        {files.length === 0 ? (
                          <div className="vcs-empty">
                            <Icon icon={Check} size={14} />
                            {t("vcs.clean")}
                          </div>
                        ) : (
                          files.map((file) => (
                            <div key={file.path} className="vcs-file-row">
                              <button
                                type="button"
                                className="vcs-file-main"
                                disabled={!activeProvider?.features.history}
                                onClick={() => {
                                  setHistoryPath(file.path);
                                  setTab("history");
                                  void loadHistory(file.path);
                                }}
                              >
                                <span className={`vcs-file-status vcs-file-status--${file.status}`}>
                                  {file.status[0]?.toUpperCase()}
                                </span>
                                <span title={file.path}>{file.path}</span>
                                {file.stateLabel ? <small>{file.stateLabel}</small> : null}
                              </button>
                              {fileOperations.length > 0 ? (
                                <div className="vcs-file-actions">
                                  {fileOperations.map(([operationId, operation]) => (
                                    <button
                                      key={operationId}
                                      type="button"
                                      title={operation.label}
                                      disabled={
                                        operationState(operationId)?.enabled === false ||
                                        (operation.requiresCleanEditor && dirty) ||
                                        busy !== null
                                      }
                                      onClick={() =>
                                        void runOperation(operationId, operation, {
                                          paths: [file.path],
                                        })
                                      }
                                    >
                                      <Icon icon={operationIcon(operationId)} size={11} />
                                    </button>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          ))
                        )}
                      </div>
                      {primaryOperation ? (
                        <div className="vcs-commit">
                          {primaryOperation[1].requiresMessage ? (
                            <Textarea
                              rows={2}
                              value={message}
                              maxLength={500}
                              placeholder={
                                primaryOperation[1].messagePlaceholder ?? t("vcs.changeMessage")
                              }
                              onChange={(event) => setMessage(event.target.value)}
                            />
                          ) : (
                            <span />
                          )}
                          <Button
                            variant="primary"
                            size="sm"
                            leadingIcon={operationIcon(primaryOperation[0])}
                            disabled={
                              operationState(primaryOperation[0])?.enabled === false ||
                              (primaryOperation[1].requiresCleanEditor && dirty) ||
                              (primaryOperation[1].requiresChanges && files.length === 0) ||
                              (primaryOperation[1].requiresMessage && !message.trim()) ||
                              busy !== null
                            }
                            title={
                              operationState(primaryOperation[0])?.reason ??
                              (primaryOperation[1].requiresCleanEditor && dirty
                                ? t("vcs.saveBeforeOperation")
                                : undefined)
                            }
                            onClick={() =>
                              void runOperation(primaryOperation[0], primaryOperation[1], {
                                message: message.trim() || undefined,
                              }).then((completed) => {
                                if (completed) setMessage("");
                              })
                            }
                          >
                            {busy === primaryOperation[0]
                              ? primaryOperation[1].busyLabel
                              : primaryOperation[1].label}
                          </Button>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className="vcs-history">
                      <div className="vcs-history-filter">
                        <span>{historyPath || t("vcs.allFiles")}</span>
                        {historyPath ? (
                          <button
                            type="button"
                            onClick={() => {
                              setHistoryPath("");
                              void loadHistory("");
                            }}
                          >
                            {t("vcs.allFiles")}
                          </button>
                        ) : null}
                      </div>
                      {busy === "history" ? (
                        <div className="vcs-loading">
                          <Icon icon={Loader2} className="vcs-spin" size={14} />
                          {t("vcs.loadingHistory")}
                        </div>
                      ) : history.length === 0 ? (
                        <div className="vcs-empty">{t("vcs.noHistory")}</div>
                      ) : (
                        history.map((entry) => (
                          <article key={entry.id}>
                            <Icon icon={Clock3} size={12} />
                            <div>
                              <strong>{entry.summary}</strong>
                              <span>
                                {entry.authorName} · {formatDate(entry.occurredAt)}
                              </span>
                            </div>
                            <code>{entry.shortId}</code>
                          </article>
                        ))
                      )}
                    </div>
                  )}

                  {footerOperations.length > 0 ? (
                    <footer className="vcs-actions">
                      {footerOperations.map(([operationId, operation]) => (
                        <Button
                          key={operationId}
                          size="sm"
                          leadingIcon={operationIcon(operationId)}
                          disabled={
                            operationState(operationId)?.enabled === false ||
                            (operation.requiresCleanEditor && dirty) ||
                            busy !== null
                          }
                          title={
                            operationState(operationId)?.reason ??
                            (operation.requiresCleanEditor && dirty
                              ? t("vcs.saveBeforeOperation")
                              : undefined)
                          }
                          onClick={() => void runOperation(operationId, operation)}
                        >
                          {busy === operationId ? operation.busyLabel : operation.label}
                        </Button>
                      ))}
                    </footer>
                  ) : null}
                </>
              )}
            </section>,
            document.body,
          )
        : null}
    </>
  );
}
