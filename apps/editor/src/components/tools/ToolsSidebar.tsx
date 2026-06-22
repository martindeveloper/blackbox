import { Box, FlaskConical, RefreshCw, Search, ShieldCheck, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { Icon } from "@/components/icons/Icon.js";
import { ListItem } from "@/components/ui/ListItem.js";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/Panel.js";
import { Page } from "@/lib/pages.js";
import { editorNavigate, useEditorSearch, type ToolId } from "@/lib/routeHelpers.js";
import { openOmnibox } from "@/lib/omnibox.js";
import { discoverTools } from "@/lib/toolsApi.js";
import { useScenarioStore } from "@/store/useScenarioStore.js";
import { toolDiscoveryInfo, useToolRunnerStore } from "@/store/useToolRunnerStore.js";

export const TOOL_ITEMS: {
  id: ToolId;
  labelKey: string;
  descKey: string;
  icon: LucideIcon;
}[] = [
  {
    id: "linter",
    labelKey: "tools.linter.title",
    descKey: "tools.linter.short",
    icon: ShieldCheck,
  },
  {
    id: "bundle",
    labelKey: "tools.bundle.title",
    descKey: "tools.bundle.short",
    icon: Box,
  },
  {
    id: "simulator",
    labelKey: "tools.simulator.title",
    descKey: "tools.simulator.short",
    icon: FlaskConical,
  },
];

export function ToolsSidebar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { tool } = useEditorSearch();
  const activeTool = tool ?? "linter";
  const projectId = useScenarioStore((s) => s.projectId);
  const discovery = useToolRunnerStore((s) => s.discovery);
  const setDiscovery = useToolRunnerStore((s) => s.setDiscovery);
  const [discovering, setDiscovering] = useState(Boolean(projectId));
  const [discoveryNonce, setDiscoveryNonce] = useState(0);
  const [trackedProjectId, setTrackedProjectId] = useState(projectId);

  if (trackedProjectId !== projectId) {
    setTrackedProjectId(projectId);
    setDiscovering(Boolean(projectId));
    setDiscoveryNonce((nonce) => nonce + 1);
  }

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    void discoverTools(projectId)
      .then((d) => {
        if (!cancelled) setDiscovery(d);
      })
      .finally(() => {
        if (!cancelled) setDiscovering(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, discoveryNonce, setDiscovery]);

  const runDiscovery = useCallback(() => {
    if (!projectId) return;
    setDiscovering(true);
    setDiscoveryNonce((nonce) => nonce + 1);
  }, [projectId]);

  return (
    <Panel className="tools-sidebar">
      <PanelHeader uppercase>
        <span className="tools-sidebar-header">
          {t("activity.tools")}
          <button
            type="button"
            className={`tools-sidebar-refresh${discovering ? " tools-sidebar-refresh--spin" : ""}`}
            disabled={discovering}
            title={t("tools.refreshDiscovery")}
            onClick={() => runDiscovery()}
          >
            <Icon icon={RefreshCw} size={10} strokeWidth={2.5} />
          </button>
        </span>
      </PanelHeader>
      <PanelBody className="tools-sidebar-body">
        {TOOL_ITEMS.map((item) => {
          const selected = activeTool === item.id;
          const info = toolDiscoveryInfo(discovery, item.id);
          const unavailable = info !== null && !info.available;

          return (
            <ListItem
              key={item.id}
              selected={selected}
              className={`tools-sidebar-item${unavailable ? " tools-sidebar-item--unavailable" : ""}`}
              onClick={() =>
                void editorNavigate(navigate, {
                  to: Page.EditorTools,
                  search: { tool: item.id },
                })
              }
            >
              <span className="tools-sidebar-item-inner">
                <span
                  className={`tools-sidebar-icon${selected ? " tools-sidebar-icon--active" : ""}${unavailable ? " tools-sidebar-icon--unavailable" : ""}`}
                >
                  <Icon icon={item.icon} size={14} strokeWidth={selected ? 2.25 : 1.75} />
                </span>
                <span className="tools-sidebar-copy">
                  <span className="tools-sidebar-label-row">
                    <span className="tools-sidebar-label">{t(item.labelKey)}</span>
                    {info?.source === "cargo" && (
                      <span className="tools-sidebar-source-tag">{t("tools.cargoSource")}</span>
                    )}
                  </span>
                  {unavailable ? (
                    <span className="tools-sidebar-desc tools-sidebar-desc--error">
                      {info.error ?? t("tools.binaryNotAvailable")}
                    </span>
                  ) : (
                    <>
                      <span className="tools-sidebar-desc">{t(item.descKey)}</span>
                      {info?.version && (
                        <span className="tools-sidebar-version">{info.version}</span>
                      )}
                    </>
                  )}
                </span>
              </span>
            </ListItem>
          );
        })}
        <ScoutListItem />
      </PanelBody>
    </Panel>
  );
}

function ScoutListItem() {
  const { t } = useTranslation();
  const discovery = useToolRunnerStore((s) => s.discovery);
  const info = discovery?.scout ?? null;
  const unavailable = info !== null && !info.available;

  return (
    <ListItem
      className={`tools-sidebar-item${unavailable ? " tools-sidebar-item--unavailable" : ""}`}
      onClick={() => openOmnibox()}
    >
      <span className="tools-sidebar-item-inner">
        <span
          className={`tools-sidebar-icon${unavailable ? " tools-sidebar-icon--unavailable" : ""}`}
        >
          <Icon icon={Search} size={14} strokeWidth={1.75} />
        </span>
        <span className="tools-sidebar-copy">
          <span className="tools-sidebar-label-row">
            <span className="tools-sidebar-label">{t("tools.scout.title")}</span>
            <span className="tools-sidebar-source-tag">{t("tools.scout.shortcut")}</span>
          </span>
          {unavailable ? (
            <span className="tools-sidebar-desc tools-sidebar-desc--error">
              {info.error ?? t("tools.binaryNotAvailable")}
            </span>
          ) : (
            <>
              <span className="tools-sidebar-desc">{t("tools.scout.short")}</span>
              {info?.version && <span className="tools-sidebar-version">{info.version}</span>}
            </>
          )}
        </span>
      </span>
    </ListItem>
  );
}
