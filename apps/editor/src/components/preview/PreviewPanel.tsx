import { useCallback, useEffect, useRef, useState } from "react";
import {
  Database,
  ExternalLink,
  Hammer,
  Monitor,
  RotateCw,
  Smartphone,
  Terminal,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { isPreviewPlayerMessage, postPreviewHostMessage } from "../../../players/web/protocol.js";
import { useScenarioStore } from "../../store/useScenarioStore.js";
import {
  finishPreviewRpcResult,
  usePreviewStore,
  type PreviewCommandSender,
} from "../../store/usePreviewStore.js";
import { API_PREFIX, ProjectRoutes, projectApiUrl } from "../../../shared/apiPaths.js";
import { notifyError, notifySuccess } from "../../lib/notifyApi.js";
import { Icon } from "../icons/Icon.js";
import { TabletLandscapeIcon } from "../icons/TabletLandscapeIcon.js";
import { EmptyState } from "../ui/EmptyState.js";
import { PreviewInspectorConsole } from "./PreviewInspectorConsole.js";

type PreviewDevice = "desktop" | "tablet" | "mobile";

interface DevicePreset {
  id: PreviewDevice;
  icon: LucideIcon;
  labelKey: string;
  width?: number;
  height?: number;
}

const DEVICE_PRESETS: readonly DevicePreset[] = [
  { id: "desktop", icon: Monitor, labelKey: "preview.deviceDesktop" },
  {
    id: "tablet",
    icon: TabletLandscapeIcon,
    labelKey: "preview.deviceTablet",
    width: 1024,
    height: 768,
  },
  { id: "mobile", icon: Smartphone, labelKey: "preview.deviceMobile", width: 390, height: 844 },
];

export function PreviewPanel() {
  const { t } = useTranslation();
  const projectId = useScenarioStore((s) => s.projectId);
  const saveProject = useScenarioStore((s) => s.save);
  const conflict = useScenarioStore((s) => s.conflict);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [building, setBuilding] = useState(false);
  const [device, setDevice] = useState<PreviewDevice>("desktop");
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [preparedProject, setPreparedProject] = useState<string | null>(null);
  const [preparingProjectId, setPreparingProjectId] = useState(projectId);

  if (preparingProjectId !== projectId) {
    setPreparingProjectId(projectId);
    setPreparedProject(null);
  }
  const connected = usePreviewStore((state) => state.connected);
  const setConnected = usePreviewStore((state) => state.setConnected);
  const setRuntimeState = usePreviewStore((state) => state.setRuntimeState);
  const setStorageState = usePreviewStore((state) => state.setStorageState);
  const addProfilerEvent = usePreviewStore((state) => state.addProfilerEvent);
  const setProfilerEvents = usePreviewStore((state) => state.setProfilerEvents);
  const addConsoleEntry = usePreviewStore((state) => state.addConsoleEntry);
  const setConsoleEntries = usePreviewStore((state) => state.setConsoleEntries);
  const resetPreviewState = usePreviewStore((state) => state.reset);
  const setCommandSender = usePreviewStore((state) => state.setCommandSender);

  const sendCommand = useCallback<PreviewCommandSender>((command) => {
    const target = iframeRef.current?.contentWindow;
    if (target) postPreviewHostMessage(target, command);
  }, []);

  useEffect(() => {
    setCommandSender(sendCommand);
    return () => setCommandSender(null);
  }, [sendCommand, setCommandSender]);

  const previewReady = preparedProject === projectId;

  const runBuild = useCallback(
    async (force: boolean) => {
      if (!projectId) return;
      setBuilding(true);
      try {
        const query = force ? "?force=1" : "";
        await fetch(`${projectApiUrl(projectId, ProjectRoutes.PreviewBuild)}${query}`);
      } catch {
      } finally {
        setBuilding(false);
        if (force) setReloadKey((key) => key + 1);
      }
    },
    [projectId],
  );

  useEffect(() => {
    // Don't attempt the pre-preview save while a disk conflict is unresolved:
    // save() refuses to write and would leave the panel spinning forever. The
    // global conflict banner offers Reload/Overwrite; once the user resolves it
    // `conflict` flips to null and this effect re-runs to prepare the preview.
    if (!projectId || preparedProject === projectId || conflict) return;
    let active = true;
    void (async () => {
      const saved = await saveProject();
      if (!active || !saved) return;
      setPreparedProject(projectId);
    })();
    return () => {
      active = false;
    };
  }, [projectId, saveProject, preparedProject, conflict]);

  useEffect(() => {
    if (!previewReady || !projectId) return;
    void (async () => {
      setBuilding(true);
      try {
        await fetch(`${projectApiUrl(projectId, ProjectRoutes.PreviewBuild)}`);
      } catch {
      } finally {
        setBuilding(false);
      }
    })();
  }, [previewReady, projectId]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== iframeRef.current?.contentWindow)
        return;
      if (!isPreviewPlayerMessage(event.data)) return;

      switch (event.data.type) {
        case "ready":
          setConnected(true);
          sendCommand({ type: "request-state" });
          break;
        case "runtime-state":
          setRuntimeState(event.data.state);
          break;
        case "storage-state":
          setStorageState(event.data.state);
          break;
        case "storage-cleared":
          setReloadKey((key) => key + 1);
          break;
        case "profiler-event":
          addProfilerEvent(event.data.event);
          break;
        case "profiler-history":
          setProfilerEvents(event.data.events);
          break;
        case "console-entry":
          addConsoleEntry(event.data.entry);
          break;
        case "console-history":
          setConsoleEntries(event.data.entries);
          break;
        case "storage-load-result":
          if (event.data.ok) {
            notifySuccess(event.data.message);
          } else {
            notifyError(event.data.message);
          }
          break;
        case "checkpoint-capture-result":
        case "checkpoint-restore-result":
          finishPreviewRpcResult(event.data);
          break;
      }
    };
    globalThis.addEventListener("message", handleMessage);
    return () => {
      globalThis.removeEventListener("message", handleMessage);
      resetPreviewState();
    };
  }, [
    addConsoleEntry,
    addProfilerEvent,
    resetPreviewState,
    sendCommand,
    setConnected,
    setConsoleEntries,
    setProfilerEvents,
    setRuntimeState,
    setStorageState,
  ]);

  const effectiveStageSize = previewReady ? stageSize : { width: 0, height: 0 };

  useEffect(() => {
    if (!previewReady) return;
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setStageSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, [previewReady, device]);

  if (!projectId) {
    return (
      <div className="preview-screen flex h-full items-center justify-center">
        <EmptyState>{t("preview.noProject")}</EmptyState>
      </div>
    );
  }

  if (preparedProject !== projectId) {
    return (
      <div className="preview-screen flex h-full items-center justify-center">
        <EmptyState>{conflict ? t("preview.conflictBlocked") : t("preview.preparing")}</EmptyState>
      </div>
    );
  }

  const src = `/preview?project=${encodeURIComponent(projectId)}&api=${API_PREFIX}`;
  const preset = DEVICE_PRESETS.find((candidate) => candidate.id === device)!;
  const scale =
    preset.width && preset.height && effectiveStageSize.width > 0 && effectiveStageSize.height > 0
      ? Math.min(
          (effectiveStageSize.width - 32) / preset.width,
          (effectiveStageSize.height - 32) / preset.height,
          1,
        )
      : 1;

  return (
    <div className="preview-screen flex h-full flex-col">
      <div className="preview-toolbar flex items-center justify-between gap-3 border-b border-[var(--editor-border)] px-3 py-2">
        <div className="preview-toolbar-title">
          <div className="text-sm font-medium">{t("preview.title")}</div>
          <span className={connected ? "preview-live preview-live--connected" : "preview-live"}>
            {connected ? t("preview.live") : t("preview.connecting")}
          </span>
        </div>
        <div className="preview-toolbar-actions">
          <div className="preview-control-group" role="group" aria-label={t("preview.devices")}>
            {DEVICE_PRESETS.map((candidate) => {
              const selected = candidate.id === device;
              return (
                <button
                  key={candidate.id}
                  type="button"
                  className={selected ? "preview-control is-active" : "preview-control"}
                  aria-pressed={selected}
                  title={t(candidate.labelKey)}
                  onClick={() => setDevice(candidate.id)}
                >
                  <Icon icon={candidate.icon} size={14} />
                  <span>{t(candidate.labelKey)}</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className="preview-control"
            disabled={!connected}
            onClick={() => sendCommand({ type: "toggle-console" })}
          >
            <Icon icon={Terminal} size={14} />
            <span>{t("preview.openConsole")}</span>
          </button>
          <button
            type="button"
            className="preview-control preview-control--danger"
            disabled={!connected}
            onClick={() => sendCommand({ type: "clear-all" })}
          >
            <Icon icon={Database} size={14} />
            <span>{t("preview.clearAll")}</span>
          </button>
          <button
            type="button"
            className="preview-control"
            onClick={() => setReloadKey((key) => key + 1)}
          >
            <Icon icon={RotateCw} size={14} />
            <span>{t("preview.reload")}</span>
          </button>
          <button
            type="button"
            className="preview-control"
            disabled={building}
            onClick={() => void runBuild(true)}
          >
            <Icon icon={Hammer} size={14} />
            <span>{t("preview.rebuild")}</span>
          </button>
          {!window.electronAPI && (
            <button
              type="button"
              className="preview-control"
              onClick={() => window.open(src, "_blank", "noopener")}
            >
              <Icon icon={ExternalLink} size={14} />
              <span>{t("preview.openExternal")}</span>
            </button>
          )}
        </div>
      </div>
      <div className="preview-workspace">
        <div ref={stageRef} className={`preview-stage preview-stage--${device}`}>
          <div
            className="preview-device-viewport"
            style={
              preset.width && preset.height
                ? {
                    width: preset.width * scale,
                    height: preset.height * scale,
                  }
                : undefined
            }
          >
            <iframe
              ref={iframeRef}
              key={reloadKey}
              className="preview-frame"
              style={
                preset.width && preset.height
                  ? {
                      width: preset.width,
                      height: preset.height,
                      transform: `scale(${scale})`,
                    }
                  : undefined
              }
              src={src}
              title={t("preview.title")}
              allow="autoplay"
              onLoad={() => {
                setConnected(false);
                setRuntimeState({ phase: "loading" });
              }}
            />
          </div>
          {preset.width && preset.height ? (
            <div className="preview-device-dimensions">
              {preset.width} × {preset.height}
              {scale < 1 ? ` · ${Math.round(scale * 100)}%` : ""}
            </div>
          ) : null}
          {building ? (
            <div className="preview-building" role="status" aria-live="polite">
              <div className="preview-building__spinner" aria-hidden="true" />
              <div className="preview-building__label">{t("preview.building")}</div>
              <div className="preview-building__bar" aria-hidden="true" />
            </div>
          ) : null}
        </div>
        <PreviewInspectorConsole />
      </div>
    </div>
  );
}
