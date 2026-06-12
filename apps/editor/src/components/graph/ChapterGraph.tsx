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
  type OnNodeDrag,
} from "@xyflow/react";
import * as dagre from "@dagrejs/dagre";

import { Skull, GitBranch } from "lucide-react";
import { graphThemeColors, useTheme } from "../../context/ThemeContext.js";
import {
  buildChapterGraph,
  applyDagreLayout,
  type ScenarioNodeData,
} from "../../lib/graphBuilder.js";
import { buildGraphInsights, type GraphAnalyticsMode } from "../../lib/heatMap.js";
import { useScenarioStore } from "../../store/useScenarioStore.js";
import { useAnalyticsStore } from "../../store/useAnalyticsStore.js";
import { Page } from "../../lib/pages.js";
import { editorNavigate, useEditorSearch } from "../../lib/routeHelpers.js";
import { Subtitle } from "../ui/Heading.js";
import { NodeCard } from "./NodeCard.js";
import { GraphToolbar } from "./GraphToolbar.js";
import { ChoiceEdge } from "./ChoiceEdge.js";
import { Icon } from "../icons/Icon.js";
import type { SimMode } from "../../lib/toolsApi.js";

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
          <div className="graph-node graph-node-selected pointer-events-auto" style={{ width: 220 }}>
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
              <span>
                {t("graph.choices", { count: deathNode?.choices?.length ?? 0 })}
              </span>
              {deathNode?.mode && deathNode.mode !== "normal" && (
                <span className={`graph-node-badge ${deathNode.mode === "game_over" ? "graph-node-badge--danger" : "graph-node-badge--success"}`}>
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
  const search = useEditorSearch();
  const chapterId = search.chapter;
  const nodeId = search.node;

  const bundle = useScenarioStore((s) => s.bundle);
  const projectId = useScenarioStore((s) => s.projectId);
  const narrativeVersion = useScenarioStore((s) => s.narrativeVersion);
  const updateNodePosition = useScenarioStore((s) => s.updateNodePosition);
  const applyLayout = useScenarioStore((s) => s.applyLayout);
  const connectNodes = useScenarioStore((s) => s.connectNodes);

  const storedAnalytics = useAnalyticsStore((s) => s.analytics);
  const analyticsProjectId = useAnalyticsStore((s) => s.projectId);
  const persistedAnalyticsStale = useAnalyticsStore((s) => s.stale);
  const analyticsNarrativeVersion = useAnalyticsStore((s) => s.narrativeVersion);
  const analyticsCapturedAt = useAnalyticsStore((s) => s.capturedAt);
  const analyticsMeta = useAnalyticsStore((s) => s.meta);
  const [showHeat, setShowHeat] = useState(false);
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
  const insights = useMemo(
    () =>
      showHeat && analytics
        ? buildGraphInsights(analytics, analyticsMode, selectedEnding ?? endings[0]?.id ?? null)
        : null,
    [showHeat, analytics, analyticsMode, selectedEnding, endings],
  );

  useEffect(() => {
    if (showHeat && !heatAvailable) setShowHeat(false);
  }, [showHeat, heatAvailable]);

  useEffect(() => {
    if (endings.length === 0) {
      setSelectedEnding(null);
      if (analyticsMode === "route") setAnalyticsMode("reach");
      return;
    }
    if (!selectedEnding || !endings.some((ending) => ending.id === selectedEnding)) {
      setSelectedEnding(endings[0]!.id);
    }
  }, [analyticsMode, endings, selectedEnding]);

  const chapter = chapterId && bundle ? bundle.chapters[chapterId] : null;

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
        const coldBadge = analyticsMode === "reach" ? "0%" : analyticsMode === "visits" ? "0x" : "";
        const fallbackTone = analyticsMode === "structure" ? "importance" : analyticsMode;
        return {
          ...node,
          position: savedPositions[node.id] ?? generatedPositions[node.id] ?? node.position,
          data: analyticsActive
            ? {
                ...node.data,
                analyticsActive: true,
                analyticsIntensity: insight?.intensity ?? 0,
                analyticsBadge: insight?.badge ?? coldBadge,
                analyticsTitle:
                  insight?.title ??
                  (analyticsMode === "route"
                    ? t("graph.heatmap.notDistinctive")
                    : t("graph.heatmap.notReached")),
                analyticsTone: insight?.tone ?? fallbackTone,
                analyticsRank: insight?.rank ?? 0,
                analyticsMarkers: insight?.markers ?? [],
                analyticsColor: insight?.color,
              }
            : node.data,
        };
      }),
    };
  }, [bundle, chapter, chapterId, insights, analyticsMode, t]);

  const [nodes, setNodes, onNodesChange] = useNodesState(graphData.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(graphData.edges);

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
        onToggleHeat={() => setShowHeat((v) => !v)}
        analyticsMode={analyticsMode}
        onAnalyticsModeChange={setAnalyticsMode}
        endings={endings}
        selectedEnding={selectedEnding}
        onEndingChange={setSelectedEnding}
        analyticsStale={analyticsStale}
      />
      <div className="graph-canvas flex-1 bg-bg">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
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
              mode={analyticsMode}
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
