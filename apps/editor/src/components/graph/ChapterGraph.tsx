import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  type Connection,
  type Edge,
  type EdgeChange,
  type OnNodeDrag,
} from "@xyflow/react";
import * as dagre from "@dagrejs/dagre";

import { Skull, GitBranch } from "lucide-react";
import { graphThemeColors, useTheme } from "@/context/ThemeContext.js";
import {
  buildChapterGraph,
  applyDagreLayout,
  type ScenarioEdgeData,
  type ScenarioNodeData,
} from "@/lib/graphBuilder.js";
import { buildGraphInsights, type GraphAnalyticsMode } from "@/lib/heatMap.js";
import { useScenarioStore } from "@/store/useScenarioStore.js";
import { useAnalyticsStore } from "@/store/useAnalyticsStore.js";
import { useModal } from "@/context/ModalProvider.js";
import { Page } from "@/lib/pages.js";
import { editorNavigate, useEditorSearch } from "@/lib/routeHelpers.js";
import { consumeNodeFocus } from "@/lib/omnibox.js";
import { Subtitle } from "@/components/ui/Heading.js";
import { NodeCard } from "./NodeCard.js";
import { GraphToolbar } from "./GraphToolbar.js";
import { ChoiceEdge } from "./ChoiceEdge.js";
import { Icon } from "@/components/icons/Icon.js";
import type { SimMode } from "@/lib/toolsApi.js";

const nodeTypes = { scenarioNode: NodeCard };
const edgeTypes = { choiceEdge: ChoiceEdge };

function GlobalDeathView() {
  const { t } = useTranslation();
  const bundle = useScenarioStore((s) => s.bundle);
  const { theme } = useTheme();
  const deathNode = bundle?.scenario.deathNode;

  return (
    <div className={`flex h-full flex-col ${theme === "dark" ? "dark" : ""}`}>
      <div className="graph-canvas flex-1 bg-bg relative">
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div
            className="graph-node graph-node-selected pointer-events-auto"
            style={{ width: 220 }}
          >
            <div className="flex items-center justify-between gap-1 mb-1">
              <span className="graph-node-id truncate flex-1">global_death</span>
              <Icon icon={Skull} size={10} className="text-danger shrink-0" />
            </div>
            {deathNode?.title ? (
              <div className="truncate text-[11px] text-text leading-snug mb-1.5">
                {deathNode.title}
              </div>
            ) : (
              <div className="truncate text-[11px] text-muted leading-snug mb-1.5 italic">
                {t("globalDeath.title")}
              </div>
            )}
            <div className="flex items-center gap-1 text-[10px] text-muted-2">
              <Icon icon={GitBranch} size={10} />
              <span>{t("graph.choices", { count: deathNode?.choices?.length ?? 0 })}</span>
              {deathNode?.mode && deathNode.mode !== "normal" && (
                <span
                  className={`graph-node-badge ${deathNode.mode === "game_over" ? "graph-node-badge--danger" : "graph-node-badge--success"}`}
                >
                  {t(`node.modes.${deathNode.mode}`)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AnalyticsLegend({
  mode,
  stale,
  capturedAt,
  runMode,
}: {
  mode: GraphAnalyticsMode;
  stale: boolean;
  capturedAt: number | null;
  runMode: SimMode | null;
}) {
  const { t, i18n } = useTranslation();
  return (
    <aside className={`graph-analytics-legend${stale ? " graph-analytics-legend--stale" : ""}`}>
      <strong>{t(`graph.heatmap.legend.${mode}.title`)}</strong>
      <span>{t(`graph.heatmap.legend.${mode}.description`)}</span>
      {runMode && (
        <span className="graph-analytics-sample-note">
          {t(
            runMode === "goals"
              ? "graph.heatmap.legend.sampleGoals"
              : "graph.heatmap.legend.sampleExplore",
          )}
        </span>
      )}
      <div className="graph-analytics-scale" aria-hidden>
        <span />
      </div>
      {capturedAt && (
        <small>
          {t("graph.heatmap.captured", {
            datetime: new Date(capturedAt).toLocaleString(i18n.language, {
              dateStyle: "medium",
              timeStyle: "short",
            }),
          })}
        </small>
      )}
      {stale && <em>{t("graph.heatmap.stale")}</em>}
    </aside>
  );
}

function ChapterGraphInner() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { confirm } = useModal();
  const search = useEditorSearch();
  const chapterId = search.chapter;
  const nodeId = search.node;

  const bundle = useScenarioStore((s) => s.bundle);
  const projectId = useScenarioStore((s) => s.projectId);
  const narrativeVersion = useScenarioStore((s) => s.narrativeVersion);
  const recentContribution = useScenarioStore((s) => s.recentContribution);
  const updateNodePosition = useScenarioStore((s) => s.updateNodePosition);
  const applyLayout = useScenarioStore((s) => s.applyLayout);
  const connectNodes = useScenarioStore((s) => s.connectNodes);
  const disconnectChoiceEdge = useScenarioStore((s) => s.disconnectChoiceEdge);
  const addNode = useScenarioStore((s) => s.addNode);
  const deleteNode = useScenarioStore((s) => s.deleteNode);
  const addChoice = useScenarioStore((s) => s.addChoice);

  const storedAnalytics = useAnalyticsStore((s) => s.analytics);
  const analyticsProjectId = useAnalyticsStore((s) => s.projectId);
  const persistedAnalyticsStale = useAnalyticsStore((s) => s.stale);
  const analyticsNarrativeVersion = useAnalyticsStore((s) => s.narrativeVersion);
  const analyticsCapturedAt = useAnalyticsStore((s) => s.capturedAt);
  const analyticsMeta = useAnalyticsStore((s) => s.meta);
  const [heatmapEnabled, setHeatmapEnabled] = useState(false);
  const [analyticsMode, setAnalyticsMode] = useState<GraphAnalyticsMode>("reach");
  const [selectedEnding, setSelectedEnding] = useState<string | null>(null);

  const analytics = projectId && analyticsProjectId === projectId ? storedAnalytics : null;
  const analyticsStale =
    persistedAnalyticsStale ||
    (analyticsNarrativeVersion !== null && analyticsNarrativeVersion !== narrativeVersion);
  const heatAvailable = analytics !== null;
  const endings = useMemo(
    () =>
      (analytics?.perEnding ?? []).map((entry) => ({
        id: entry.ending,
        label: `${entry.ending} (${entry.pathCount.toLocaleString()})`,
      })),
    [analytics],
  );
  const showHeat = heatmapEnabled && heatAvailable;
  const activeEnding =
    selectedEnding && endings.some((ending) => ending.id === selectedEnding)
      ? selectedEnding
      : (endings[0]?.id ?? null);
  const effectiveAnalyticsMode =
    analyticsMode === "route" && endings.length === 0 ? "reach" : analyticsMode;

  const insights = useMemo(
    () =>
      showHeat && analytics
        ? buildGraphInsights(analytics, effectiveAnalyticsMode, activeEnding)
        : null,
    [showHeat, analytics, effectiveAnalyticsMode, activeEnding],
  );

  const chapter = chapterId && bundle ? bundle.chapters[chapterId] : null;
  const recentlyChangedNodeIds = useMemo(() => {
    const ids = new Set<string>();
    if (!chapterId) return ids;
    for (const change of recentContribution?.contribution?.changes ?? []) {
      if (change.chapterId !== chapterId || change.action === "removed") continue;
      if (change.entity === "node") ids.add(change.id);
      if (change.entity === "choice" && change.parentId) ids.add(change.parentId);
    }
    return ids;
  }, [recentContribution, chapterId]);
  const recentContributor = recentContribution?.contribution?.contributor;

  const graphData = useMemo(() => {
    if (!bundle || !chapter || !chapterId) {
      return { nodes: [], edges: [] };
    }
    const graph = buildChapterGraph(
      chapter,
      bundle.scenario,
      bundle.layout,
      bundle.items,
      chapterId,
    );
    const generatedPositions = applyDagreLayout(
      graph.nodes,
      graph.edges,
      dagre,
      chapter.startNodeId,
    );
    const savedPositions = bundle.layout.chapters[chapterId]?.nodes ?? {};

    return {
      ...graph,
      nodes: graph.nodes.map((node) => {
        const insight = insights?.get(node.id);
        const analyticsActive = insights !== null;
        const coldBadge =
          effectiveAnalyticsMode === "reach"
            ? "0%"
            : effectiveAnalyticsMode === "visits"
              ? "0x"
              : "";
        const fallbackTone =
          effectiveAnalyticsMode === "structure" ? "importance" : effectiveAnalyticsMode;
        return {
          ...node,
          position: savedPositions[node.id] ?? generatedPositions[node.id] ?? node.position,
          data: analyticsActive
            ? {
                ...node.data,
                inspectorSelected: node.id === nodeId,
                recentlyChangedBy: recentlyChangedNodeIds.has(node.id)
                  ? recentContributor
                  : undefined,
                analyticsActive: true,
                analyticsIntensity: insight?.intensity ?? 0,
                analyticsBadge: insight?.badge ?? coldBadge,
                analyticsTitle:
                  insight?.title ??
                  (effectiveAnalyticsMode === "route"
                    ? t("graph.heatmap.notDistinctive")
                    : t("graph.heatmap.notReached")),
                analyticsTone: insight?.tone ?? fallbackTone,
                analyticsRank: insight?.rank ?? 0,
                analyticsMarkers: insight?.markers ?? [],
                analyticsColor: insight?.color,
              }
            : {
                ...node.data,
                inspectorSelected: node.id === nodeId,
                recentlyChangedBy: recentlyChangedNodeIds.has(node.id)
                  ? recentContributor
                  : undefined,
              },
        };
      }),
    };
  }, [
    bundle,
    chapter,
    chapterId,
    insights,
    effectiveAnalyticsMode,
    nodeId,
    recentlyChangedNodeIds,
    recentContributor,
    t,
  ]);

  const [nodes, setNodes, onNodesChange] = useNodesState(graphData.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(graphData.edges);

  const handleEdgesChange = useCallback(
    (changes: EdgeChange<Edge<ScenarioEdgeData>>[]) => {
      if (chapterId) {
        for (const change of changes) {
          if (change.type !== "remove") continue;
          const edge = edges.find((candidate) => candidate.id === change.id) as
            | Edge<ScenarioEdgeData>
            | undefined;
          const data = edge?.data;
          if (!edge || !data?.choiceId) continue;
          disconnectChoiceEdge(chapterId, edge.source, data.choiceId, data.kind);
        }
      }
      onEdgesChange(changes);
    },
    [chapterId, disconnectChoiceEdge, edges, onEdgesChange],
  );

  useEffect(() => {
    setNodes(graphData.nodes);
    setEdges(graphData.edges);
  }, [graphData, setNodes, setEdges]);

  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        selected: n.id === nodeId,
      })),
    );
  }, [nodeId, setNodes]);

  useEffect(() => {
    if (!chapterId || !nodeId) return;
    const selectedNodeWasRemoved = recentContribution?.contribution?.changes?.some(
      (change) =>
        change.entity === "node" &&
        change.action === "removed" &&
        change.chapterId === chapterId &&
        change.id === nodeId,
    );
    if (!selectedNodeWasRemoved) return;
    void editorNavigate(navigate, {
      to: Page.EditorGraph,
      search: { chapter: chapterId, node: null },
    });
  }, [recentContribution, chapterId, navigate, nodeId]);

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!chapterId || !connection.source || !connection.target) return;
      if (connection.target.startsWith("chapter:")) {
        const targetChapterId = connection.target.slice("chapter:".length);
        void editorNavigate(navigate, {
          to: Page.EditorGraph,
          search: { chapter: targetChapterId, node: null },
        });
        return;
      }
      connectNodes(chapterId, connection.source, connection.target);
      setEdges((eds) => addEdge({ ...connection, type: "smoothstep" }, eds));
    },
    [chapterId, connectNodes, setEdges, navigate],
  );

  const onNodeDragStop: OnNodeDrag = useCallback(
    (_event, node) => {
      if (!chapterId) return;
      updateNodePosition(chapterId, node.id, node.position.x, node.position.y);
    },
    [chapterId, updateNodePosition],
  );

  const { fitView } = useReactFlow();

  // Recenter/zoom on a node only when arriving from search — `consumeNodeFocus`
  // fires once per request, after the target chapter's nodes are laid out, so
  // ordinary in-graph clicks never move the viewport.
  useEffect(() => {
    if (!nodeId || !chapterId) return;
    if (!nodes.some((n) => n.id === nodeId)) return;
    if (!consumeNodeFocus(chapterId, nodeId)) return;
    requestAnimationFrame(() => {
      void fitView({ nodes: [{ id: nodeId }], padding: 0.5, maxZoom: 1.5, duration: 450 });
    });
  }, [nodeId, chapterId, nodes, fitView]);

  const handleAutoLayout = useCallback(() => {
    if (!chapterId) return;
    const positions = applyDagreLayout(nodes, edges, dagre, chapter?.startNodeId);
    applyLayout(chapterId, positions);
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        position: positions[n.id] ?? n.position,
      })),
    );
    requestAnimationFrame(() => {
      void fitView({ padding: 0.18, maxZoom: 1, duration: 260 });
    });
  }, [chapterId, chapter?.startNodeId, nodes, edges, applyLayout, setNodes, fitView]);

  const handleAddNode = useCallback(() => {
    if (!chapterId || !chapter) return;
    const id = `node_${Date.now()}`;
    if (chapter.nodes[id]) return;
    addNode(chapterId, id);
    void editorNavigate(navigate, {
      to: Page.EditorGraph,
      search: { chapter: chapterId, node: id },
    });
  }, [chapterId, chapter, addNode, navigate]);

  const handleDeleteNode = useCallback(async () => {
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
  }, [chapterId, nodeId, confirm, deleteNode, navigate, t]);

  // Power-user shortcuts for the graph canvas. Single-key bindings stay clear of
  // text-entry fields and of the modifier combos handled globally in EditorShell.
  useEffect(() => {
    const isTextEntry = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!chapterId || search.globalNode === "death") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTextEntry(event.target)) return;

      switch (event.key) {
        case "n":
        case "N":
          event.preventDefault();
          handleAddNode();
          break;
        case "c":
        case "C":
          if (!nodeId) return;
          event.preventDefault();
          addChoice(chapterId, nodeId);
          break;
        case "Backspace":
        case "Delete":
          if (!nodeId) return;
          event.preventDefault();
          void handleDeleteNode();
          break;
        case "l":
        case "L":
          event.preventDefault();
          handleAutoLayout();
          break;
        case "f":
        case "F":
          event.preventDefault();
          void fitView({ padding: 0.18, maxZoom: 1, duration: 260 });
          break;
        case "h":
        case "H":
          if (!heatAvailable) return;
          event.preventDefault();
          setHeatmapEnabled((value) => !value);
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    chapterId,
    nodeId,
    search.globalNode,
    handleAddNode,
    handleDeleteNode,
    handleAutoLayout,
    addChoice,
    fitView,
    heatAvailable,
  ]);

  const { theme } = useTheme();
  const graphColors = graphThemeColors[theme];

  if (search.globalNode === "death") {
    return <GlobalDeathView />;
  }

  if (!bundle || !chapter) {
    return (
      <div className="flex h-full items-center justify-center">
        <Subtitle>{t("graph.selectChapter")}</Subtitle>
      </div>
    );
  }

  return (
    <div className={`flex h-full flex-col ${theme === "dark" ? "dark" : ""}`}>
      <GraphToolbar
        nodeCount={nodes.length}
        routeCount={edges.length}
        onAutoLayout={handleAutoLayout}
        heatAvailable={heatAvailable}
        showHeat={showHeat}
        onToggleHeat={() => setHeatmapEnabled((value) => !value)}
        analyticsMode={effectiveAnalyticsMode}
        onAnalyticsModeChange={setAnalyticsMode}
        endings={endings}
        selectedEnding={activeEnding}
        onEndingChange={setSelectedEnding}
        analyticsStale={analyticsStale}
      />
      <div className="graph-canvas flex-1 bg-bg">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={onConnect}
          onNodeDragStop={onNodeDragStop}
          onNodeClick={(_e, node) =>
            void editorNavigate(navigate, {
              to: Page.EditorGraph,
              search: { chapter: chapterId, node: node.id },
            })
          }
          onPaneClick={() =>
            void editorNavigate(navigate, {
              to: Page.EditorGraph,
              search: { chapter: chapterId, node: null },
            })
          }
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{ padding: 0.18, maxZoom: 1 }}
          minZoom={0.2}
          maxZoom={1.5}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} size={1} color={graphColors.grid} />
          <Controls />
          {showHeat && (
            <AnalyticsLegend
              mode={effectiveAnalyticsMode}
              stale={analyticsStale}
              capturedAt={analyticsCapturedAt}
              runMode={analyticsMeta?.mode ?? null}
            />
          )}
          <MiniMap
            nodeColor={(node) => {
              const data = node.data as ScenarioNodeData;
              if (!data.analyticsActive || (data.analyticsIntensity ?? 0) <= 0) {
                return graphColors.minimap;
              }
              if (data.analyticsColor) return data.analyticsColor;
              if (data.analyticsTone === "spine") return "#6b9cf0";
              if (data.analyticsTone === "split") return "#e8c468";
              if (data.analyticsTone === "route") return "#c084fc";
              return "#ff5a3c";
            }}
            maskColor={graphColors.mask}
          />
        </ReactFlow>
      </div>
    </div>
  );
}

export function ChapterGraph() {
  return (
    <ReactFlowProvider>
      <ChapterGraphInner />
    </ReactFlowProvider>
  );
}
