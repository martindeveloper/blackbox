import { Flame, GitBranch, LayoutGrid, Plus, Star, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { useModal } from "../../context/ModalProvider.js";
import { useScenarioStore } from "../../store/useScenarioStore.js";
import { Page } from "../../lib/pages.js";
import type { GraphAnalyticsMode } from "../../lib/heatMap.js";
import { editorNavigate, useEditorSearch } from "../../lib/routeHelpers.js";
import { Button } from "../ui/Button.js";
import { Input } from "../ui/Input.js";
import { Toolbar } from "../ui/Toolbar.js";
import { GraphHelp } from "./GraphHelp.js";

interface GraphToolbarProps {
  nodeCount: number;
  routeCount: number;
  onAutoLayout: () => void;
  heatAvailable: boolean;
  showHeat: boolean;
  onToggleHeat: () => void;
  analyticsMode: GraphAnalyticsMode;
  onAnalyticsModeChange: (mode: GraphAnalyticsMode) => void;
  endings: { id: string; label: string }[];
  selectedEnding: string | null;
  onEndingChange: (ending: string) => void;
  analyticsStale: boolean;
}

export function GraphToolbar({
  nodeCount,
  routeCount,
  onAutoLayout,
  heatAvailable,
  showHeat,
  onToggleHeat,
  analyticsMode,
  onAnalyticsModeChange,
  endings,
  selectedEnding,
  onEndingChange,
  analyticsStale,
}: GraphToolbarProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { confirm } = useModal();
  const search = useEditorSearch();
  const chapterId = search.chapter;
  const nodeId = search.node;

  const addNode = useScenarioStore((s) => s.addNode);
  const deleteNode = useScenarioStore((s) => s.deleteNode);
  const bundle = useScenarioStore((s) => s.bundle);

  const [newNodeId, setNewNodeId] = useState("");

  const chapter = chapterId && bundle ? bundle.chapters[chapterId] : null;

  const handleAdd = () => {
    if (!chapterId) return;
    const id = newNodeId.trim() || `node_${Date.now()}`;
    if (chapter?.nodes[id]) return;
    addNode(chapterId, id);
    setNewNodeId("");
    void editorNavigate(navigate, {
      to: Page.EditorGraph,
      search: { chapter: chapterId, node: id },
    });
  };

  const handleDelete = async () => {
    if (!chapterId || !nodeId) return;
    const ok = await confirm({
      title: t("graph.confirmDelete.title"),
      message: t("graph.confirmDelete.message", { nodeId }),
      variant: "danger",
      confirmLabel: t("common.delete"),
    });
    if (!ok) return;
    deleteNode(chapterId, nodeId);
    void editorNavigate(navigate, {
      to: Page.EditorGraph,
      search: { chapter: chapterId, node: null },
    });
  };

  return (
    <Toolbar className="graph-toolbar">
      <div className="graph-toolbar-context">
        <span className="graph-toolbar-title">{chapter?.title ?? t("graph.noChapter")}</span>
        <span className="graph-toolbar-stat">{t("graph.nodes", { count: nodeCount })}</span>
        <span className="graph-toolbar-stat">
          <GitBranch size={10} aria-hidden="true" />
          {t("graph.routes", { count: routeCount })}
        </span>
        {chapter ? (
          <span className="graph-toolbar-start" title={chapter.startNodeId}>
            <Star size={9} aria-hidden="true" />
            {t("graph.start")}: <strong>{chapter.startNodeId}</strong>
          </span>
        ) : null}
      </div>
      <div className="graph-toolbar-actions">
        <Input
          mono
          compact
          className="graph-toolbar-input"
          placeholder={t("graph.newNodeIdPlaceholder")}
          value={newNodeId}
          onChange={(e) => setNewNodeId(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
        <Button size="sm" leadingIcon={Plus} onClick={handleAdd}>
          {t("graph.addNode")}
        </Button>
        <Button
          variant="danger"
          size="sm"
          icon
          leadingIcon={Trash2}
          disabled={!nodeId}
          title={t("common.delete")}
          onClick={() => void handleDelete()}
        />
        <Button
          variant="ghost"
          size="sm"
          leadingIcon={LayoutGrid}
          title={t("graph.autoLayout")}
          onClick={onAutoLayout}
        >
          {t("graph.arrange")}
        </Button>
        <Button
          variant={showHeat ? "primary" : "ghost"}
          size="sm"
          leadingIcon={Flame}
          disabled={!heatAvailable}
          aria-pressed={showHeat}
          title={heatAvailable ? t("graph.heatmap.toggle") : t("graph.heatmap.unavailable")}
          onClick={onToggleHeat}
        >
          {t("graph.heatmap.label")}
        </Button>
        {showHeat && (
          <>
            <select
              className="graph-analytics-select"
              value={analyticsMode}
              aria-label={t("graph.heatmap.lens")}
              onChange={(event) => onAnalyticsModeChange(event.target.value as GraphAnalyticsMode)}
            >
              <option value="reach">{t("graph.heatmap.reach")}</option>
              <option value="visits">{t("graph.heatmap.visits")}</option>
              <option value="structure">{t("graph.heatmap.structure")}</option>
              <option value="route" disabled={endings.length === 0}>
                {t("graph.heatmap.route")}
              </option>
            </select>
            {analyticsMode === "route" && endings.length > 0 && (
              <select
                className="graph-analytics-select graph-analytics-select--route"
                value={selectedEnding ?? endings[0]?.id ?? ""}
                aria-label={t("graph.heatmap.ending")}
                onChange={(event) => onEndingChange(event.target.value)}
              >
                {endings.map((ending) => (
                  <option key={ending.id} value={ending.id}>
                    {ending.label}
                  </option>
                ))}
              </select>
            )}
            {analyticsStale && (
              <span className="graph-analytics-stale">{t("graph.heatmap.staleBadge")}</span>
            )}
          </>
        )}
        <GraphHelp />
      </div>
    </Toolbar>
  );
}
