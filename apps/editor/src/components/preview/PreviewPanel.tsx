import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import {
  Database,
  ExternalLink,
  Hammer,
  Monitor,
  RotateCw,
  Smartphone,
  Terminal,
  type LucideIcon,
  type LucideProps,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { isPreviewPlayerMessage, postPreviewHostMessage } from "@players/web/protocol.js";
import { useScenarioStore } from "@/store/useScenarioStore.js";
import {
  finishPreviewRpcResult,
  usePreviewStore,
  type PreviewCommandSender,
} from "@/store/usePreviewStore.js";
import { API_PREFIX, ProjectRoutes, projectApiUrl } from "@shared/apiPaths.js";
import { notifyError, notifySuccess } from "@/lib/notifyApi.js";
import { Icon } from "@/components/icons/Icon.js";
import { TabletLandscapeIcon } from "@/components/icons/TabletLandscapeIcon.js";
import { EmptyState } from "@/components/ui/EmptyState.js";
import { PreviewInspectorConsole } from "./PreviewInspectorConsole.js";

type PreviewDevice = "desktop" | "responsive" | "tablet" | "mobile";
type FramedPreviewDevice = Exclude<PreviewDevice, "desktop">;
type ViewportSize = { width: number; height: number };
type ResizeHandle = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

interface DevicePreset {
  id: PreviewDevice;
  icon: LucideIcon;
  labelKey: string;
}

const ResponsiveIcon: LucideIcon = forwardRef<SVGSVGElement, LucideProps>(
  ({ color = "currentColor", size = 24, strokeWidth = 2, className, ...props }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
      focusable={false}
      {...props}
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M8 9h8" />
      <path d="M8 15h8" />
      <path d="M5 12h14" />
    </svg>
  ),
);

ResponsiveIcon.displayName = "ResponsiveIcon";

const DEVICE_PRESETS: readonly DevicePreset[] = [
  { id: "desktop", icon: Monitor, labelKey: "preview.deviceDesktop" },
  {
    id: "responsive",
    icon: ResponsiveIcon,
    labelKey: "preview.deviceResponsive",
  },
  {
    id: "tablet",
    icon: TabletLandscapeIcon,
    labelKey: "preview.deviceTablet",
  },
  { id: "mobile", icon: Smartphone, labelKey: "preview.deviceMobile" },
];

const RESIZE_HANDLES: readonly ResizeHandle[] = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];
const MIN_VIEWPORT_SIZE: ViewportSize = { width: 240, height: 180 };
const MAX_VIEWPORT_SIZE: ViewportSize = { width: 3840, height: 2160 };
const DEFAULT_VIEWPORT_SIZES: Record<FramedPreviewDevice, ViewportSize> = {
  responsive: { width: 1280, height: 720 },
  tablet: { width: 1024, height: 768 },
  mobile: { width: 390, height: 844 },
};

function clampDimension(value: number, axis: keyof ViewportSize) {
  const min = MIN_VIEWPORT_SIZE[axis];
  const max = MAX_VIEWPORT_SIZE[axis];
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function parseViewportSizeInput(value: string): ViewportSize | null {
  const matches = value.match(/\d+(?:\.\d+)?/g);
  if (!matches || matches.length < 2) return null;
  const [width, height] = matches.map(Number);
  if (width === undefined || height === undefined) return null;
  return {
    width: clampDimension(width, "width"),
    height: clampDimension(height, "height"),
  };
}

function isFramedDevice(device: PreviewDevice): device is FramedPreviewDevice {
  return device !== "desktop";
}

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
  const [viewportSizes, setViewportSizes] =
    useState<Record<FramedPreviewDevice, ViewportSize>>(DEFAULT_VIEWPORT_SIZES);
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

  const updateViewportSize = useCallback(
    (targetDevice: FramedPreviewDevice, next: ViewportSize) => {
      setViewportSizes((sizes) => ({
        ...sizes,
        [targetDevice]: {
          width: clampDimension(next.width, "width"),
          height: clampDimension(next.height, "height"),
        },
      }));
    },
    [],
  );

  const startViewportResize = useCallback(
    (
      handle: ResizeHandle,
      startX: number,
      startY: number,
      startSize: ViewportSize,
      resizeScale: number,
    ) => {
      if (device !== "responsive") return;
      let frameId: number | null = null;
      let pendingSize = startSize;
      const scaleFactor = Math.max(resizeScale, 0.1);
      const applyPendingSize = () => {
        frameId = null;
        updateViewportSize("responsive", pendingSize);
      };
      const onMouseMove = (event: MouseEvent) => {
        const deltaX = (event.clientX - startX) / scaleFactor;
        const deltaY = (event.clientY - startY) / scaleFactor;
        const movesWest = handle.includes("w");
        const movesEast = handle.includes("e");
        const movesNorth = handle.includes("n");
        const movesSouth = handle.includes("s");
        pendingSize = {
          width: clampDimension(
            startSize.width + (movesEast ? deltaX : 0) - (movesWest ? deltaX : 0),
            "width",
          ),
          height: clampDimension(
            startSize.height + (movesSouth ? deltaY : 0) - (movesNorth ? deltaY : 0),
            "height",
          ),
        };
        if (frameId === null) frameId = requestAnimationFrame(applyPendingSize);
      };
      const onMouseUp = () => {
        if (frameId !== null) cancelAnimationFrame(frameId);
        applyPendingSize();
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    [device, updateViewportSize],
  );

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
  const viewportSize = isFramedDevice(device) ? viewportSizes[device] : null;
  const scale =
    viewportSize && effectiveStageSize.width > 0 && effectiveStageSize.height > 0
      ? Math.min(
          (effectiveStageSize.width - 32) / viewportSize.width,
          (effectiveStageSize.height - 32) / viewportSize.height,
          1,
        )
      : 1;
  const commitDimensionInput = (
    targetDevice: FramedPreviewDevice,
    event: FormEvent<HTMLInputElement>,
    axis: keyof ViewportSize,
  ) => {
    const input = event.currentTarget;
    const current = viewportSizes[targetDevice];
    const parsedSize = parseViewportSizeInput(input.value);
    if (parsedSize) {
      updateViewportSize(targetDevice, parsedSize);
      input.value = String(parsedSize[axis]);
      return;
    }
    const singleValue = Number.parseFloat(input.value);
    const next = clampDimension(singleValue, axis);
    updateViewportSize(targetDevice, { ...current, [axis]: next });
    input.value = String(next);
  };
  const blurOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") event.currentTarget.blur();
  };

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
          {viewportSize ? (
            <div
              className={
                device === "responsive"
                  ? "preview-device-shell preview-device-shell--resizable"
                  : "preview-device-shell"
              }
              style={{
                width: viewportSize.width * scale,
                height: viewportSize.height * scale,
              }}
            >
              <div className="preview-device-viewport">
                <iframe
                  ref={iframeRef}
                  key={reloadKey}
                  className="preview-frame"
                  style={{
                    width: viewportSize.width,
                    height: viewportSize.height,
                    transform: `scale(${scale})`,
                  }}
                  src={src}
                  title={t("preview.title")}
                  allow="autoplay"
                  onLoad={() => {
                    setConnected(false);
                    setRuntimeState({ phase: "loading" });
                  }}
                />
              </div>
              {device === "responsive"
                ? RESIZE_HANDLES.map((handle) => (
                    <button
                      key={handle}
                      type="button"
                      className={`preview-resize-handle preview-resize-handle--${handle}`}
                      aria-label={t("preview.resizeViewport")}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        startViewportResize(
                          handle,
                          event.clientX,
                          event.clientY,
                          viewportSizes.responsive,
                          scale,
                        );
                      }}
                    />
                  ))
                : null}
            </div>
          ) : (
            <div className="preview-device-viewport">
              <iframe
                ref={iframeRef}
                key={reloadKey}
                className="preview-frame"
                src={src}
                title={t("preview.title")}
                allow="autoplay"
                onLoad={() => {
                  setConnected(false);
                  setRuntimeState({ phase: "loading" });
                }}
              />
            </div>
          )}
          {viewportSize && isFramedDevice(device) ? (
            <form
              className="preview-device-dimensions"
              onSubmit={(event) => event.preventDefault()}
            >
              <input
                key={`${device}-width-${viewportSize.width}`}
                type="text"
                inputMode="numeric"
                defaultValue={viewportSize.width}
                aria-label={t("preview.viewportWidth")}
                onBlur={(event) => commitDimensionInput(device, event, "width")}
                onKeyDown={blurOnEnter}
              />
              <span aria-hidden>×</span>
              <input
                key={`${device}-height-${viewportSize.height}`}
                type="text"
                inputMode="numeric"
                defaultValue={viewportSize.height}
                aria-label={t("preview.viewportHeight")}
                onBlur={(event) => commitDimensionInput(device, event, "height")}
                onKeyDown={blurOnEnter}
              />
              {scale < 1 ? (
                <span className="preview-device-scale">· {Math.round(scale * 100)}%</span>
              ) : null}
            </form>
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
