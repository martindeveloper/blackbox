import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useScenarioStore } from "../../store/useScenarioStore.js";
import { isActiveEditorPage, Page } from "../../lib/pages.js";
import { editorNavigate, useActivityView, useEditorSearch } from "../../lib/routeHelpers.js";
import { useUserPrefs } from "../../hooks/useUserPrefs.js";
import { useHeatmapHydration } from "../../hooks/useHeatmapHydration.js";
import { confirmModal } from "../../lib/modalApi.js";
import { ActivityBar } from "./ActivityBar.js";
import { FileTree } from "./FileTree.js";
import { PreviewEventsSidebar } from "../preview/PreviewEventsSidebar.js";
import { ToolsSidebar } from "../tools/ToolsSidebar.js";
import { InspectorPanel } from "./InspectorPanel.js";
import { TopBar } from "./TopBar.js";
import { EditorFooter } from "./EditorFooter.js";
import { Icon } from "../icons/Icon.js";

import {
  clampLeftPanelWidth,
  clampRightPanelWidth,
  DEFAULT_LEFT_PANEL,
  DEFAULT_RIGHT_PANEL,
} from "../../lib/panelLayout.js";

function PanelHandle({
  side,
  collapsed,
  dragging,
  onMouseDown,
  onToggle,
}: {
  side: "left" | "right";
  collapsed: boolean;
  dragging: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const expandTitle =
    side === "left" ? t("shell.expandLeftPanel") : t("shell.expandInspectorPanel");
  const resizeLabel =
    side === "left" ? t("shell.resizeLeftPanel") : t("shell.resizeInspectorPanel");
  const collapseTitle =
    side === "left" ? t("shell.collapseLeftPanel") : t("shell.collapseInspectorPanel");

  if (collapsed) {
    return (
      <button type="button" className="panel-expand-strip" onClick={onToggle} title={expandTitle}>
        <Icon icon={side === "left" ? ChevronRight : ChevronLeft} size={10} />
      </button>
    );
  }

  return (
    <div className={`resize-handle${dragging ? " resize-handle--active" : ""}`}>
      <span className="resize-handle-line" aria-hidden />
      <button
        type="button"
        className="resize-handle-drag"
        aria-label={resizeLabel}
        onMouseDown={onMouseDown}
      />
      <button
        type="button"
        className="resize-handle-collapse"
        onClick={onToggle}
        title={collapseTitle}
      >
        <Icon icon={side === "left" ? ChevronLeft : ChevronRight} size={10} />
      </button>
    </div>
  );
}

export function EditorShell() {
  const { t } = useTranslation();
  const dirty = useScenarioStore((s) => s.dirty);
  const conflict = useScenarioStore((s) => s.conflict);
  const save = useScenarioStore((s) => s.save);
  const undo = useScenarioStore((s) => s.undo);
  const redo = useScenarioStore((s) => s.redo);
  const reloadProject = useScenarioStore((s) => s.reloadProject);
  const overwriteConflict = useScenarioStore((s) => s.overwriteConflict);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useEditorSearch();
  const { prefs, ready, updatePrefs } = useUserPrefs();
  useHeatmapHydration();

  const [leftWidth, setLeftWidth] = useState(DEFAULT_LEFT_PANEL);
  const [rightWidth, setRightWidth] = useState(DEFAULT_RIGHT_PANEL);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [dragging, setDragging] = useState<"left" | "right" | null>(null);

  const prevLeftWidth = useRef(leftWidth);
  const prevRightWidth = useRef(rightWidth);
  const prefsKey = `${prefs.leftColumnWidth ?? ""}:${prefs.rightColumnWidth ?? ""}`;
  const [syncedPrefsKey, setSyncedPrefsKey] = useState<string | null>(null);

  if (ready && syncedPrefsKey !== prefsKey) {
    setSyncedPrefsKey(prefsKey);
    setLeftWidth(clampLeftPanelWidth(prefs.leftColumnWidth ?? DEFAULT_LEFT_PANEL));
    setRightWidth(clampRightPanelWidth(prefs.rightColumnWidth ?? DEFAULT_RIGHT_PANEL));
  }

  useEffect(() => {
    prevLeftWidth.current = leftWidth;
    prevRightWidth.current = rightWidth;
  }, [leftWidth, rightWidth]);

  const activity = useActivityView();
  const isMedia = activity === "media";
  const isAbout = activity === "about";
  const isDashboard = activity === "dashboard";
  const isTools = activity === "tools";
  const isBuild = activity === "build";
  const isPreview = activity === "preview";
  const hideLeftDock = isMedia || isAbout || isDashboard || isBuild;

  useEffect(() => {
    const isTextEntry = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        void save();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !isTextEntry(e.target)) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y" && !isTextEntry(e.target)) {
        e.preventDefault();
        redo();
      }
      if (e.key === "Escape" && isActiveEditorPage(pathname, Page.EditorGraph)) {
        void editorNavigate(navigate, {
          to: Page.EditorGraph,
          search: (prev) => ({ ...prev, chapter: search.chapter, node: null }),
        });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [save, undo, redo, navigate, pathname, search.chapter]);

  useEffect(() => {
    const electron = window.electronAPI;
    if (electron) {
      electron.setDirty(dirty.size > 0);
      return;
    }
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty.size > 0) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    const electron = window.electronAPI;
    if (!electron) return;
    return electron.onRequestClose(() => {
      void (async () => {
        const state = useScenarioStore.getState();
        if (state.dirty.size > 0) {
          const choice = await confirmModal({
            title: t("topBar.closeUnsavedTitle"),
            message: t("topBar.closeUnsavedMessage"),
            confirmLabel: t("topBar.closeUnsavedSave"),
            cancelLabel: t("topBar.closeUnsavedDiscard"),
            closeAborts: true,
          });
          if (choice === null) {
            electron.cancelClose();
            return;
          }
          if (choice === true) {
            const saved = await state.save();
            if (!saved || useScenarioStore.getState().dirty.size > 0) {
              electron.cancelClose();
              return;
            }
          }
        }
        electron.confirmClose();
      })();
    });
  }, [t]);

  const startDrag = (side: "left" | "right", startX: number, startWidth: number) => {
    setDragging(side);
    let frameId: number | null = null;
    let pendingWidth = startWidth;
    const applyPendingWidth = () => {
      frameId = null;
      if (side === "left") setLeftWidth(pendingWidth);
      else setRightWidth(pendingWidth);
    };
    const onMouseMove = (e: MouseEvent) => {
      if (side === "left") {
        pendingWidth = clampLeftPanelWidth(startWidth + e.clientX - startX);
        prevLeftWidth.current = pendingWidth;
      } else {
        pendingWidth = clampRightPanelWidth(startWidth - (e.clientX - startX));
        prevRightWidth.current = pendingWidth;
      }
      if (frameId === null) frameId = requestAnimationFrame(applyPendingWidth);
    };
    const onMouseUp = () => {
      if (frameId !== null) cancelAnimationFrame(frameId);
      applyPendingWidth();
      setDragging(null);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      if (side === "left") updatePrefs({ leftColumnWidth: prevLeftWidth.current });
      else updatePrefs({ rightColumnWidth: prevRightWidth.current });
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const toggleLeft = () => {
    if (leftCollapsed) {
      setLeftCollapsed(false);
      setLeftWidth(prevLeftWidth.current);
    } else {
      prevLeftWidth.current = leftWidth;
      setLeftCollapsed(true);
    }
  };

  const toggleRight = () => {
    if (rightCollapsed) {
      setRightCollapsed(false);
      setRightWidth(prevRightWidth.current);
    } else {
      prevRightWidth.current = rightWidth;
      setRightCollapsed(true);
    }
  };

  return (
    <div className="editor-shell flex h-full flex-col">
      <TopBar />
      {conflict ? (
        <div className="flex items-center gap-3 border-b border-danger bg-danger/10 px-3 py-2 text-xs">
          <strong>{t("conflict.title")}</strong>
          <span className="flex-1">{t("conflict.message")}</span>
          <button className="editor-btn editor-btn-sm" onClick={() => void reloadProject()}>
            {t("conflict.reload")}
          </button>
          <button
            className="editor-btn editor-btn-sm editor-btn-primary"
            onClick={() => void overwriteConflict()}
          >
            {t("conflict.overwrite")}
          </button>
        </div>
      ) : null}
      <div
        className="editor-workspace flex min-h-0 flex-1"
        style={{ "--editor-left-dock-width": `${leftWidth}px` } as CSSProperties}
      >
        <ActivityBar />

        {!hideLeftDock && (
          <>
            <aside
              className="editor-dock editor-dock-left flex shrink-0 flex-col"
              style={{ width: leftCollapsed ? 0 : leftWidth }}
            >
              {!leftCollapsed &&
                (isTools ? <ToolsSidebar /> : isPreview ? <PreviewEventsSidebar /> : <FileTree />)}
            </aside>
            <PanelHandle
              side="left"
              collapsed={leftCollapsed}
              dragging={dragging === "left"}
              onMouseDown={(e) => !leftCollapsed && startDrag("left", e.clientX, leftWidth)}
              onToggle={toggleLeft}
            />
          </>
        )}

        <main className="editor-stage min-w-0 flex-1 overflow-hidden">
          <Outlet />
        </main>

        <PanelHandle
          side="right"
          collapsed={rightCollapsed}
          dragging={dragging === "right"}
          onMouseDown={(e) => !rightCollapsed && startDrag("right", e.clientX, rightWidth)}
          onToggle={toggleRight}
        />

        <aside
          className="editor-dock editor-dock-right flex shrink-0 flex-col"
          style={{ width: rightCollapsed ? 0 : rightWidth }}
        >
          {!rightCollapsed && <InspectorPanel />}
        </aside>
      </div>
      <EditorFooter />
      {dragging && <div className="resize-overlay" />}
    </div>
  );
}
