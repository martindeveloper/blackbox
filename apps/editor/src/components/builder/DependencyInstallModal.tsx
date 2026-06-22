import { AlertTriangle, CheckCircle2, Download, Loader2, Terminal } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  DependencyInstallInfo,
  DependencyInstallResult,
  InstallableDependency,
} from "../../types/electron.js";
import { Icon } from "../icons/Icon.js";
import { ModalShell } from "../overlay/ModalShell.js";
import { Button } from "../ui/Button.js";

interface DependencyInstallModalProps {
  dependency: InstallableDependency;
  onClose: () => void;
  onInstalled: () => Promise<void>;
}

export function DependencyInstallModal({
  dependency,
  onClose,
  onInstalled,
}: DependencyInstallModalProps) {
  const { t } = useTranslation();
  const [info, setInfo] = useState<DependencyInstallInfo | null>(null);
  const [result, setResult] = useState<DependencyInstallResult | null>(null);
  const [loading, setLoading] = useState(Boolean(window.electronAPI));
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    let active = true;
    const api = window.electronAPI;
    if (!api) return;
    void api
      .getDependencyInstallInfo(dependency)
      .then((next) => {
        if (active) setInfo(next);
      })
      .catch((error) => {
        if (active) setResult({ ok: false, output: String(error), restartRequired: false });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [dependency]);

  const install = async () => {
    if (!window.electronAPI || installing) return;
    setInstalling(true);
    setResult(null);
    try {
      const next = await window.electronAPI.installDependency(dependency);
      setResult(next);
      if (next.ok && !next.restartRequired) await onInstalled();
    } catch (error) {
      setResult({
        ok: false,
        output: error instanceof Error ? error.message : String(error),
        restartRequired: false,
      });
    } finally {
      setInstalling(false);
    }
  };

  const title = t(`build.dependencies.${dependency}.title`);

  return (
    <ModalShell
      title={title}
      onClose={() => {
        if (!installing) onClose();
      }}
      dismissOnBackdrop={!installing}
      footer={
        <>
          <Button variant="ghost" disabled={installing} onClick={onClose}>
            {result?.ok ? t("common.ok") : t("common.cancel")}
          </Button>
          {info?.canInstall && !result?.ok ? (
            <Button
              variant="primary"
              leadingIcon={installing ? Loader2 : Download}
              disabled={installing}
              onClick={() => void install()}
            >
              {installing
                ? t("build.dependencies.installing")
                : t("build.dependencies.installButton", {
                    manager: info.packageManager,
                  })}
            </Button>
          ) : null}
        </>
      }
    >
      <div className="dependency-install">
        <p>{t(`build.dependencies.${dependency}.description`)}</p>
        {loading ? (
          <div className="dependency-install-status">
            <Icon icon={Loader2} size={14} className="build-spin" />
            <span>{t("build.dependencies.detecting")}</span>
          </div>
        ) : info ? (
          <>
            <div className="dependency-install-meta">
              <span>{info.platformLabel}</span>
              <span>{info.packageManager ?? t("build.dependencies.manual")}</span>
            </div>
            <div className="dependency-install-command">
              <Icon icon={Terminal} size={13} />
              <code>{info.command}</code>
            </div>
            {info.unavailableReason ? (
              <div className="dependency-install-status dependency-install-status--warning">
                <Icon icon={AlertTriangle} size={14} />
                <span>{info.unavailableReason}</span>
              </div>
            ) : (
              <p className="dependency-install-note">{t("build.dependencies.permissionNote")}</p>
            )}
          </>
        ) : (
          <div className="dependency-install-status dependency-install-status--warning">
            <Icon icon={AlertTriangle} size={14} />
            <span>{t("build.dependencies.desktopOnly")}</span>
          </div>
        )}
        {result ? (
          <div
            className={`dependency-install-result dependency-install-result--${result.ok ? "success" : "error"}`}
            role="status"
          >
            <Icon icon={result.ok ? CheckCircle2 : AlertTriangle} size={14} />
            <div>
              <strong>
                {result.ok
                  ? result.restartRequired
                    ? t("build.dependencies.installSuccessRestart")
                    : t("build.dependencies.installSuccess")
                  : t("build.dependencies.installFailed")}
              </strong>
              <pre>{result.output}</pre>
            </div>
          </div>
        ) : null}
      </div>
    </ModalShell>
  );
}
