import { MarkerType, type Edge, type Node } from "@xyflow/react";
import * as dagre from "@dagrejs/dagre";
import type { ProjectInspectBundle } from "./toolsApi.js";

export interface BundleGraphNodeData extends Record<string, unknown> {
  kind: ProjectInspectBundle["kind"];
  label: string;
  entryCount: number;
  blobBytes: number;
  bundleId: string | null;
  depCount: number;
  accentIndex: number;
}

export type BundleGraphNode = Node<BundleGraphNodeData>;
export type BundleGraphEdge = Edge;

function bundleNodeId(bundle: ProjectInspectBundle): string {
  return bundle.bundleId ?? bundle.name;
}

function nodeDimensions(
  kind: ProjectInspectBundle["kind"],
  blobBytes: number,
): {
  width: number;
  height: number;
} {
  const minWidth = kind === "SHARED" ? 168 : 148;
  const maxWidth = kind === "SHARED" ? 240 : 210;
  const scale = Math.min(1, Math.log10(Math.max(blobBytes, 1) + 1) / 5.5);
  const width = Math.round(minWidth + (maxWidth - minWidth) * scale);
  return { width, height: kind === "SHARED" ? 78 : 68 };
}

export function buildBundleDependencyGraph(bundles: ProjectInspectBundle[]): {
  nodes: BundleGraphNode[];
  edges: BundleGraphEdge[];
  unresolved: string[];
} {
  if (bundles.length === 0) {
    return { nodes: [], edges: [], unresolved: [] };
  }

  const byId = new Map<string, ProjectInspectBundle>();
  const byName = new Map<string, ProjectInspectBundle>();
  for (const bundle of bundles) {
    byId.set(bundleNodeId(bundle), bundle);
    byName.set(bundle.name, bundle);
    if (bundle.bundleId) byName.set(bundle.bundleId, bundle);
  }

  const resolveDependency = (dep: string): string | null => {
    if (byId.has(dep)) return dep;
    const match = byName.get(dep);
    return match ? bundleNodeId(match) : null;
  };

  const chapterBundles = bundles.filter((bundle) => bundle.kind === "CHAPTER");
  const edges: BundleGraphEdge[] = [];
  const unresolved = new Set<string>();

  for (const bundle of bundles) {
    const sourceId = bundleNodeId(bundle);
    for (const dep of bundle.dependencies) {
      const targetId = resolveDependency(dep);
      if (!targetId) {
        unresolved.add(dep);
        continue;
      }
      if (sourceId === targetId) continue;
      edges.push({
        id: `${sourceId}->${targetId}`,
        source: sourceId,
        target: targetId,
        type: "smoothstep",
        animated: false,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 14,
          height: 14,
          color: "var(--bundle-graph-edge)",
        },
        style: {
          stroke: "var(--bundle-graph-edge)",
          strokeWidth: 1.5,
        },
      });
    }
  }

  const nodes: BundleGraphNode[] = bundles.map((bundle) => {
    const id = bundleNodeId(bundle);
    const { width, height } = nodeDimensions(bundle.kind, bundle.blobBytes);
    const accentIndex =
      bundle.kind === "SHARED"
        ? -1
        : chapterBundles.findIndex((entry) => bundleNodeId(entry) === id);

    return {
      id,
      type: "bundleNode",
      position: { x: 0, y: 0 },
      data: {
        kind: bundle.kind,
        label: bundle.name,
        entryCount: bundle.entryCount,
        blobBytes: bundle.blobBytes,
        bundleId: bundle.bundleId,
        depCount: bundle.dependencies.length,
        accentIndex,
      },
      width,
      height,
    };
  });

  applyBundleDagreLayout(nodes, edges);

  return { nodes, edges, unresolved: [...unresolved] };
}

export function applyBundleDagreLayout(nodes: BundleGraphNode[], edges: BundleGraphEdge[]): void {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: "TB",
    nodesep: 52,
    ranksep: 72,
    edgesep: 24,
    marginx: 28,
    marginy: 24,
  });

  for (const node of nodes) {
    g.setNode(node.id, {
      width: node.width ?? 160,
      height: node.height ?? 72,
    });
  }

  const nodeIds = new Set(nodes.map((node) => node.id));
  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue;
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  for (const node of nodes) {
    const layout = g.node(node.id);
    if (!layout) continue;
    node.position = {
      x: layout.x - (node.width ?? 160) / 2,
      y: layout.y - (node.height ?? 72) / 2,
    };
  }
}
