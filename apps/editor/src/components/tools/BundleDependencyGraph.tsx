import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type NodeMouseHandler,
} from "@xyflow/react";
import { graphThemeColors, useTheme } from "../../context/ThemeContext.js";
import { buildBundleDependencyGraph, type BundleGraphNode } from "../../lib/bundleGraphBuilder.js";
import type { ProjectInspectBundle } from "../../lib/toolsApi.js";
import { BundleGraphNode as BundleGraphNodeCard } from "./BundleGraphNode.js";

const nodeTypes = { bundleNode: BundleGraphNodeCard };

interface BundleDependencyGraphProps {
  bundles: ProjectInspectBundle[];
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
}

function BundleDependencyGraphInner({ bundles, selectedId, onSelect }: BundleDependencyGraphProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const graphColors = graphThemeColors[theme];
  const { fitView } = useReactFlow();

  const graph = useMemo(() => buildBundleDependencyGraph(bundles), [bundles]);
  const [nodes, setNodes, onNodesChange] = useNodesState(graph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(graph.edges);

  useEffect(() => {
    setNodes(
      graph.nodes.map((node) => ({
        ...node,
        selected: node.id === selectedId,
      })),
    );
    setEdges(graph.edges);
  }, [graph, selectedId, setNodes, setEdges]);

  useEffect(() => {
    if (nodes.length === 0) return;
    const id = window.requestAnimationFrame(() => {
      void fitView({ padding: 0.22, duration: 280 });
    });
    return () => window.cancelAnimationFrame(id);
  }, [nodes.length, fitView]);

  const onNodeClick: NodeMouseHandler<BundleGraphNode> = (_event, node) => {
    onSelect?.(node.id === selectedId ? null : node.id);
  };

  const sharedCount = bundles.filter((bundle) => bundle.kind === "SHARED").length;
  const chapterCount = bundles.length - sharedCount;

  return (
    <div className="bundle-graph">
      <header className="bundle-graph-header">
        <div className="bundle-graph-heading">
          <span className="bundle-graph-kicker">{t("tools.bundle.graphKicker")}</span>
          <span className="bundle-graph-title">{t("tools.bundle.graphTitle")}</span>
        </div>
        <div className="bundle-graph-legend">
          <span className="bundle-graph-legend-item bundle-graph-legend-item--shared">
            <span className="bundle-graph-legend-swatch" aria-hidden />
            {t("tools.bundle.graphShared", { count: sharedCount })}
          </span>
          <span className="bundle-graph-legend-item bundle-graph-legend-item--chapter">
            <span className="bundle-graph-legend-swatch" aria-hidden />
            {t("tools.bundle.graphChapters", { count: chapterCount })}
          </span>
          <span className="bundle-graph-legend-item bundle-graph-legend-item--edge">
            <span className="bundle-graph-legend-line" aria-hidden />
            {t("tools.bundle.graphDependsOn")}
          </span>
        </div>
      </header>

      <div className="bundle-graph-canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
          panOnScroll
          zoomOnScroll
          minZoom={0.35}
          maxZoom={1.6}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={18} size={1} color={graphColors.grid} />
          <Controls showInteractive={false} />
          <MiniMap
            nodeColor={(node) =>
              node.data?.kind === "SHARED"
                ? "var(--bundle-graph-shared)"
                : "var(--bundle-graph-chapter-2)"
            }
            maskColor={graphColors.mask}
            pannable
            zoomable
          />
        </ReactFlow>
      </div>

      {graph.unresolved.length > 0 && (
        <p className="bundle-graph-warning">
          {t("tools.bundle.graphUnresolved", { deps: graph.unresolved.join(", ") })}
        </p>
      )}
    </div>
  );
}

export function BundleDependencyGraph(props: BundleDependencyGraphProps) {
  if (props.bundles.length === 0) return null;

  return (
    <ReactFlowProvider>
      <BundleDependencyGraphInner {...props} />
    </ReactFlowProvider>
  );
}
