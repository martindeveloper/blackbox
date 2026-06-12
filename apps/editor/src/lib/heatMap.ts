import type { SimAnalytics, SimHotNode } from "./toolsApi.js";

export type GraphAnalyticsMode = "reach" | "visits" | "structure" | "route";
export type GraphInsightTone = "reach" | "visits" | "importance" | "spine" | "split" | "route";

export interface GraphInsight {
  intensity: number;
  badge: string;
  title: string;
  tone: GraphInsightTone;
  rank: number;
  markers: ("spine" | "split")[];
  color?: string;
}

export type GraphInsightMap = Map<string, GraphInsight>;

function clampUnit(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function compactCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString();
}

function trafficRows(analytics: SimAnalytics): SimHotNode[] {
  return analytics.nodeTraffic ?? analytics.hotNodes;
}

function trafficInsights(analytics: SimAnalytics, mode: "reach" | "visits"): GraphInsightMap {
  const rows = trafficRows(analytics);
  const sorted = [...rows].sort((a, b) =>
    mode === "reach" ? b.reachPct - a.reachPct : b.visits - a.visits,
  );
  const maxVisits = sorted.reduce((max, row) => Math.max(max, row.visits), 0);
  const visitScale = Math.log1p(maxVisits);
  const map: GraphInsightMap = new Map();

  sorted.forEach((row, rank) => {
    const reach = Math.round(row.reachPct);
    const intensity =
      mode === "reach"
        ? clampUnit(row.reachPct / 100)
        : visitScale > 0
          ? clampUnit(Math.log1p(row.visits) / visitScale)
          : 0;
    map.set(row.id, {
      intensity,
      badge: mode === "reach" ? `${reach}%` : `${compactCount(row.visits)}x`,
      title:
        mode === "reach"
          ? `Reached on ${reach}% of completed paths`
          : `${compactCount(row.visits)} visits across ${reach}% of completed paths`,
      tone: mode,
      rank,
      markers: [],
    });
  });
  return map;
}

function structureInsights(analytics: SimAnalytics): GraphInsightMap {
  const mandatory = new Set(analytics.mandatoryNodes);
  const split = new Set(analytics.splitCandidates.map((node) => node.id));
  const importance = new Map(
    (analytics.nodeImportance ?? analytics.importance).map((row) => [row.id, row]),
  );
  const nodeIds = new Set([
    ...trafficRows(analytics).map((node) => node.id),
    ...mandatory,
    ...split,
    ...importance.keys(),
  ]);
  const map: GraphInsightMap = new Map();

  for (const id of nodeIds) {
    const row = importance.get(id);
    const markers: GraphInsight["markers"] = [];
    if (mandatory.has(id)) markers.push("spine");
    if (split.has(id)) markers.push("split");
    const tone: GraphInsightTone = mandatory.has(id)
      ? "spine"
      : split.has(id)
        ? "split"
        : "importance";
    const pct = mandatory.has(id) ? 100 : (row?.pct ?? 0);
    const badge = mandatory.has(id)
      ? "Spine"
      : split.has(id)
        ? "Split"
        : row
          ? `${Math.round(row.pct)}% ends`
          : "";
    map.set(id, {
      intensity: clampUnit(pct / 100),
      badge,
      title: mandatory.has(id)
        ? "Static path to every ending"
        : split.has(id)
          ? "High-traffic node with one authored choice"
          : row
            ? `Can reach ${row.count} of ${row.total} endings`
            : "No structural hotspot detected",
      tone,
      rank: 0,
      markers,
    });
  }
  return map;
}

function routeInsights(analytics: SimAnalytics, ending: string | null): GraphInsightMap {
  const routeIndex = analytics.perEnding.findIndex((entry) => entry.ending === ending);
  const route = routeIndex >= 0 ? analytics.perEnding[routeIndex] : null;
  if (!route) return new Map();
  const routeColors = ["#c084fc", "#49a6ff", "#6fcf97", "#e8c468", "#f07070", "#df6c00"];
  const color = routeColors[routeIndex % routeColors.length];
  const sorted = [...route.nodes].sort((a, b) => b.reachPct - a.reachPct);
  const map: GraphInsightMap = new Map();
  sorted.forEach((node, rank) => {
    const pct = Math.round(node.reachPct);
    map.set(node.id, {
      intensity: clampUnit(node.reachPct / 100),
      badge: `${pct}%`,
      title: `Distinctive to ${route.ending}; reached on ${pct}% of its paths`,
      tone: "route",
      rank,
      markers: [],
      color,
    });
  });
  map.set(route.ending, {
    intensity: 1,
    badge: "End",
    title: `${compactCount(route.pathCount)} completed paths end here`,
    tone: "route",
    rank: 0,
    markers: [],
    color,
  });
  return map;
}

export function buildGraphInsights(
  analytics: SimAnalytics,
  mode: GraphAnalyticsMode,
  ending: string | null = null,
): GraphInsightMap {
  if (mode === "reach" || mode === "visits") return trafficInsights(analytics, mode);
  if (mode === "structure") return structureInsights(analytics);
  return routeInsights(analytics, ending);
}
