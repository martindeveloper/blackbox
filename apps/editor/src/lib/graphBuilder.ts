import { MarkerType, type Edge, type Node } from "@xyflow/react";
import { collectSnippetIdsFromText } from "./libraryRefs.js";
import type { ProjectContribution } from "./projectApi.js";
import type {
  Chapter,
  ChoiceContent,
  EditorLayout,
  GameContent,
  ItemCatalog,
} from "@/types/wire.js";

export type GraphEdgeKind =
  | "goto"
  | "checkSuccess"
  | "checkFailure"
  | "checkExhausted"
  | "gotoChapter"
  | "itemAction";

export interface ScenarioNodeData {
  nodeId: string;
  title: string;
  choiceCount: number;
  isStart: boolean;
  isDeath: boolean;
  isGameOver: boolean;
  isEnding: boolean;
  extendsTemplate?: string;
  snippetIds: string[];
  incomingHandles: string[];
  outgoingHandles: string[];
  analyticsActive?: boolean;
  analyticsIntensity?: number;
  analyticsBadge?: string;
  analyticsTitle?: string;
  analyticsTone?: "reach" | "visits" | "importance" | "spine" | "split" | "route";
  analyticsRank?: number;
  analyticsMarkers?: ("spine" | "split")[];
  analyticsColor?: string;
  inspectorSelected?: boolean;
  recentlyChangedBy?: ProjectContribution["contributor"];
  [key: string]: unknown;
}

export interface ScenarioEdgeData {
  kind: GraphEdgeKind;
  label: string;
  choiceId?: string;
  routeOffset?: number;
  routeIndex?: number;
  routeCount?: number;
  sourceRouteIndex?: number;
  sourceRouteCount?: number;
  sourcePortIndex?: number;
  sourcePortCount?: number;
  loopIndex?: number;
  loopCount?: number;
  [key: string]: unknown;
}

const EDGE_COLORS: Record<GraphEdgeKind, string> = {
  goto: "#df6c00",
  checkSuccess: "#4caf50",
  checkFailure: "#e53935",
  checkExhausted: "#e57c35",
  gotoChapter: "#7e57c2",
  itemAction: "#78909c",
};

function edgeAppearance(kind: GraphEdgeKind, dashed = false) {
  const color = EDGE_COLORS[kind];
  return {
    type: "choiceEdge",
    style: {
      stroke: color,
      strokeDasharray: dashed ? "6 4" : undefined,
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 12,
      height: 12,
      color,
    },
  };
}

function spreadParallelEdges(edges: Edge<ScenarioEdgeData>[]): void {
  const groups = new Map<string, Edge<ScenarioEdgeData>[]>();

  for (const edge of edges) {
    const key = `${edge.source}\u0000${edge.target}`;
    const group = groups.get(key) ?? [];
    group.push(edge);
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    const count = group.length;
    group.forEach((edge, index) => {
      const spacing = edge.source === edge.target ? 28 : 34;
      edge.data = {
        ...edge.data!,
        routeIndex: index,
        routeCount: count,
        routeOffset: (index - (count - 1) / 2) * spacing,
      };
    });
  }
}

function assignEdgeHandles(nodes: Node<ScenarioNodeData>[], edges: Edge<ScenarioEdgeData>[]): void {
  const incomingByNode = new Map<string, Edge<ScenarioEdgeData>[]>();
  const outgoingByNode = new Map<string, Edge<ScenarioEdgeData>[]>();

  for (const edge of edges) {
    const outgoing = outgoingByNode.get(edge.source) ?? [];
    outgoing.push(edge);
    outgoingByNode.set(edge.source, outgoing);

    const incoming = incomingByNode.get(edge.target) ?? [];
    incoming.push(edge);
    incomingByNode.set(edge.target, incoming);
  }

  for (const node of nodes) {
    const incoming = incomingByNode.get(node.id) ?? [];
    const outgoing = outgoingByNode.get(node.id) ?? [];
    const loops = outgoing.filter((edge) => edge.target === node.id);
    const routes = outgoing.filter((edge) => edge.target !== node.id);

    loops.forEach((edge, index) => {
      edge.data = {
        ...edge.data!,
        loopIndex: index,
        loopCount: loops.length,
      };
    });
    routes.forEach((edge, index) => {
      edge.data = {
        ...edge.data!,
        sourceRouteIndex: index,
        sourceRouteCount: routes.length,
      };
    });

    node.data.incomingHandles = incoming.map((edge, index) => {
      const handleId = `in-${index}-${edge.id}`;
      edge.targetHandle = handleId;
      return handleId;
    });
    node.data.outgoingHandles = outgoing.map((edge, index) => {
      const handleId = `out-${index}-${edge.id}`;
      edge.sourceHandle = handleId;
      edge.data = {
        ...edge.data!,
        sourcePortIndex: index,
        sourcePortCount: outgoing.length,
      };
      return handleId;
    });
  }
}

export function buildChapterGraph(
  chapter: Chapter,
  scenario: GameContent,
  layout: EditorLayout,
  items: ItemCatalog,
  chapterId: string,
): { nodes: Node<ScenarioNodeData>[]; edges: Edge<ScenarioEdgeData>[] } {
  const nodes: Node<ScenarioNodeData>[] = [];
  const edges: Edge<ScenarioEdgeData>[] = [];
  const chapterLayout = layout.chapters[chapterId]?.nodes ?? {};

  const deathNodeId = chapter.deathNodeId;

  let index = 0;
  for (const [nodeId, node] of Object.entries(chapter.nodes)) {
    const pos = chapterLayout[nodeId] ?? {
      x: 80 + (index % 4) * 220,
      y: 80 + Math.floor(index / 4) * 140,
    };
    index++;

    nodes.push({
      id: nodeId,
      type: "scenarioNode",
      position: pos,
      data: {
        nodeId,
        title: node.title ?? nodeId,
        choiceCount: node.choices?.length ?? 0,
        isStart: nodeId === chapter.startNodeId,
        isDeath: nodeId === deathNodeId,
        isGameOver: node.mode === "game_over",
        isEnding: node.mode === "ending",
        extendsTemplate: node.$extends,
        snippetIds: collectSnippetIdsFromText(node.text),
        incomingHandles: [],
        outgoingHandles: [],
      },
    });

    for (const choice of node.choices ?? []) {
      collectChoiceEdges(nodeId, choice, edges);
    }
  }

  for (const item of Object.values(items.items)) {
    for (const action of item.actions ?? []) {
      if (!action.goto) continue;
      if (action.when && typeof action.when === "object" && "type" in action.when) {
        const gate = action.when;
        if (gate.type === "atNode" && chapter.nodes[gate.nodeId]) {
          edges.push({
            id: `item-${item.id}-${action.id}-${gate.nodeId}-${action.goto}`,
            source: gate.nodeId,
            target: action.goto,
            data: { kind: "itemAction", label: action.label, choiceId: action.id },
            ...edgeAppearance("itemAction", true),
          });
        }
      }
    }
  }

  spreadParallelEdges(edges);
  assignEdgeHandles(nodes, edges);
  return { nodes, edges };
}

function collectChoiceEdges(
  sourceId: string,
  choice: ChoiceContent,
  edges: Edge<ScenarioEdgeData>[],
): void {
  if (choice.goto) {
    edges.push({
      id: `${sourceId}-${choice.id}-goto-${choice.goto}`,
      source: sourceId,
      target: choice.goto,
      data: { kind: "goto", label: choice.label, choiceId: choice.id },
      ...edgeAppearance("goto"),
    });
  }

  if (choice.check) {
    if (choice.check.onSuccess.goto) {
      edges.push({
        id: `${sourceId}-${choice.id}-success-${choice.check.onSuccess.goto}`,
        source: sourceId,
        target: choice.check.onSuccess.goto,
        data: { kind: "checkSuccess", label: `Pass · ${choice.label}`, choiceId: choice.id },
        ...edgeAppearance("checkSuccess", true),
      });
    }
    if (choice.check.onFailure.goto) {
      edges.push({
        id: `${sourceId}-${choice.id}-failure-${choice.check.onFailure.goto}`,
        source: sourceId,
        target: choice.check.onFailure.goto,
        data: { kind: "checkFailure", label: `Fail · ${choice.label}`, choiceId: choice.id },
        ...edgeAppearance("checkFailure", true),
      });
    }
    if (choice.check.onExhausted?.goto) {
      edges.push({
        id: `${sourceId}-${choice.id}-exhausted-${choice.check.onExhausted.goto}`,
        source: sourceId,
        target: choice.check.onExhausted.goto,
        data: { kind: "checkExhausted", label: `Exhausted · ${choice.label}`, choiceId: choice.id },
        ...edgeAppearance("checkExhausted", true),
      });
    }
  }

  if (choice.action?.type === "gotoChapter") {
    const target = choice.action.nodeId ?? `chapter:${choice.action.chapterId}`;
    edges.push({
      id: `${sourceId}-${choice.id}-chapter-${choice.action.chapterId}`,
      source: sourceId,
      target,
      data: {
        kind: "gotoChapter",
        label: `Chapter · ${choice.action.chapterId}`,
        choiceId: choice.id,
      },
      ...edgeAppearance("gotoChapter", true),
    });
  }
}

export function applyDagreLayout(
  nodes: Node<ScenarioNodeData>[],
  edges: Edge<ScenarioEdgeData>[],
  dagre: typeof import("@dagrejs/dagre"),
  rootNodeId?: string,
): Record<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: "TB",
    nodesep: 84,
    ranksep: 118,
    edgesep: 28,
    marginx: 32,
    marginy: 32,
  });

  for (const node of nodes) {
    g.setNode(node.id, { width: 200, height: 76 });
  }

  const nodeIds = new Set(nodes.map((node) => node.id));
  const depthByNode = new Map<string, number>();
  // Spanning-tree parent + the source port (choice) index of the edge that first
  // reached each node. Used after layout to fan children out in choice order.
  const parentByNode = new Map<string, { parent: string; port: number }>();
  if (rootNodeId && nodeIds.has(rootNodeId)) {
    const queue = [rootNodeId];
    depthByNode.set(rootNodeId, 0);

    for (let index = 0; index < queue.length; index++) {
      const source = queue[index]!;
      const sourceDepth = depthByNode.get(source)!;
      for (const edge of edges) {
        if (edge.source !== source || !nodeIds.has(edge.target)) continue;
        if (depthByNode.has(edge.target)) continue;
        depthByNode.set(edge.target, sourceDepth + 1);
        parentByNode.set(edge.target, {
          parent: source,
          port: edge.data?.sourcePortIndex ?? 0,
        });
        queue.push(edge.target);
      }
    }
  }

  for (const edge of edges) {
    if (edge.target.startsWith("chapter:")) continue;
    if (!nodeIds.has(edge.target)) continue;
    const sourceDepth = depthByNode.get(edge.source);
    const targetDepth = depthByNode.get(edge.target);
    // Drop only strict back-edges (loops to a shallower ancestor) so we don't
    // create rank cycles. Keep forward same-depth edges (e.g. a node feeding its
    // row-neighbour) so dagre's longest-path ranking pushes the target down a
    // rank instead of leaving them side-by-side with the edge looping sideways.
    if (sourceDepth !== undefined && targetDepth !== undefined && sourceDepth > targetDepth) {
      continue;
    }
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  const positions: Record<string, { x: number; y: number }> = {};
  for (const node of nodes) {
    const pos = g.node(node.id);
    if (pos) {
      positions[node.id] = { x: pos.x - 100, y: pos.y - 38 };
    }
  }

  // Dagre lays each node out as a single point and ignores where its source
  // ports sit, so a fan-out can end up ordered opposite to its choices —
  // crossing the edges. Re-slot each row left-to-right by (parent x, choice
  // port index) so every parent's children follow the order of its handles.
  const rows = new Map<number, string[]>();
  for (const id of Object.keys(positions)) {
    const key = Math.round(positions[id]!.y);
    (rows.get(key) ?? rows.set(key, []).get(key)!).push(id);
  }

  for (const key of [...rows.keys()].sort((a, b) => a - b)) {
    const row = rows.get(key)!;
    if (row.length < 2) continue;
    const slots = row.map((id) => positions[id]!.x).sort((a, b) => a - b);
    const sortKey = (id: string): [number, number] => {
      const info = parentByNode.get(id);
      const parentX = info ? (positions[info.parent]?.x ?? positions[id]!.x) : positions[id]!.x;
      return [parentX, info?.port ?? 0];
    };
    const ordered = [...row].sort((a, b) => {
      const [ax, ap] = sortKey(a);
      const [bx, bp] = sortKey(b);
      if (ax !== bx) return ax - bx;
      if (ap !== bp) return ap - bp;
      return positions[a]!.x - positions[b]!.x;
    });
    ordered.forEach((id, index) => {
      positions[id]!.x = slots[index]!;
    });
  }

  return positions;
}
