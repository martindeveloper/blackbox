import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";

type EndingTone = "orange" | "blue" | "green" | "amber";

type GraphNode = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  sid: string;
  title: string;
  meta?: string;
  accent?: boolean;
  ending?: EndingTone;
};

type GraphEdge = {
  from: string;
  to: string;
  label?: string;
  labelX: number;
  labelY: number;
  pass?: boolean;
  fail?: boolean;
};

type NodeText = {
  id: string;
  sid: string;
  title: string;
  meta?: string;
};

type EdgeText = {
  from: string;
  to: string;
  label?: string;
};

const NODE_LAYOUT: Pick<GraphNode, "id" | "x" | "y" | "w" | "h" | "accent" | "ending">[] = [
  { id: "start", x: 700, y: 48, w: 178, h: 64, accent: true },
  { id: "archive", x: 502, y: 188, w: 196, h: 72 },
  { id: "security", x: 812, y: 192, w: 200, h: 72, accent: true },
  { id: "tunnels", x: 452, y: 336, w: 210, h: 76 },
  { id: "chapel", x: 712, y: 340, w: 204, h: 76 },
  { id: "server", x: 968, y: 336, w: 184, h: 72 },
  { id: "shepherd", x: 356, y: 540, w: 198, h: 80, ending: "orange" },
  { id: "question", x: 576, y: 576, w: 200, h: 80, ending: "blue" },
  { id: "protocol", x: 800, y: 540, w: 210, h: 80, ending: "green" },
  { id: "witness", x: 1026, y: 576, w: 200, h: 80, ending: "amber" },
];

const EDGE_LAYOUT: Pick<GraphEdge, "from" | "to" | "labelX" | "labelY" | "pass" | "fail">[] = [
  { from: "start", to: "archive", labelX: 612, labelY: 150 },
  { from: "start", to: "security", labelX: 800, labelY: 150 },
  { from: "archive", to: "tunnels", labelX: 540, labelY: 300 },
  { from: "security", to: "chapel", labelX: 820, labelY: 300, pass: true },
  { from: "security", to: "server", labelX: 980, labelY: 300, fail: true },
  { from: "tunnels", to: "shepherd", labelX: 470, labelY: 484 },
  { from: "tunnels", to: "question", labelX: 612, labelY: 490 },
  { from: "chapel", to: "question", labelX: 720, labelY: 492 },
  { from: "chapel", to: "protocol", labelX: 832, labelY: 484 },
  { from: "server", to: "protocol", labelX: 962, labelY: 486 },
  { from: "server", to: "witness", labelX: 1080, labelY: 486 },
];

const FLOW_INTERVAL_MS = 5200;

function randomRoute(previous: string[] = []): string[] {
  let route: string[];

  do {
    route = ["start"];
    let current = "start";

    while (true) {
      const choices = EDGE_LAYOUT.filter((edge) => edge.from === current);
      if (choices.length === 0) break;
      const next = choices[Math.floor(Math.random() * choices.length)]!.to;
      route.push(next);
      current = next;
    }
  } while (route.join("/") === previous.join("/"));

  return route;
}

function buildGraph(
  nodeText: NodeText[],
  edgeText: EdgeText[],
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes = NODE_LAYOUT.map((layout) => {
    const text = nodeText.find((node) => node.id === layout.id);
    if (!text) throw new Error(`Missing hero graph node text: ${layout.id}`);
    return { ...layout, ...text };
  });

  const edges = EDGE_LAYOUT.map((layout) => {
    const text = edgeText.find((edge) => edge.from === layout.from && edge.to === layout.to);
    if (!text) throw new Error(`Missing hero graph edge text: ${layout.from}->${layout.to}`);
    return { ...layout, ...text };
  });

  return { nodes, edges };
}

function getNode(nodes: GraphNode[], id: string): GraphNode {
  const node = nodes.find((n) => n.id === id);
  if (!node) throw new Error(`Missing graph node: ${id}`);
  return node;
}

function edgePath(from: GraphNode, to: GraphNode): string {
  const sx = from.x + from.w / 2;
  const sy = from.y + from.h;
  const ex = to.x + to.w / 2;
  const ey = to.y;
  const dy = ey - sy;
  const c1y = sy + dy * 0.55;
  const c2y = ey - dy * 0.55;
  return `M ${sx} ${sy} C ${sx} ${c1y}, ${ex} ${c2y}, ${ex} ${ey}`;
}

function GraphNodeCard({ node, flowStep }: { node: GraphNode; flowStep?: number }) {
  const boxClass = node.ending
    ? `hero-graph-node-box hero-graph-node-box--ending hero-graph-node-box--ending-${node.ending}`
    : `hero-graph-node-box${node.accent ? " hero-graph-node-box--accent" : ""}`;
  const idClass = node.ending
    ? `hero-graph-node-id hero-graph-node-id--ending-${node.ending}`
    : "hero-graph-node-id";
  const flowStyle =
    flowStep === undefined ? undefined : ({ "--hero-flow-step": flowStep } as CSSProperties);

  return (
    <g
      className={`hero-graph-node${flowStep === undefined ? "" : " hero-graph-node--flow"}`}
      transform={`translate(${node.x}, ${node.y})`}
      style={flowStyle}
    >
      <rect className={boxClass} width={node.w} height={node.h} rx={4} />
      {flowStep !== undefined && (
        <rect className="hero-graph-node-flow-ring" width={node.w} height={node.h} rx={4} />
      )}
      {node.ending && (
        <rect
          className={`hero-graph-node-rail hero-graph-node-rail--${node.ending}`}
          width={3}
          height={node.h}
          rx={1.5}
        />
      )}
      <text className={idClass} x={node.ending ? 16 : 12} y={20}>
        {node.sid}
      </text>
      <text className="hero-graph-node-title" x={node.ending ? 16 : 12} y={40}>
        {node.title}
      </text>
      {node.meta && (
        <text className="hero-graph-node-meta" x={node.ending ? 16 : 12} y={58}>
          {node.meta}
        </text>
      )}
      {node.ending && (
        <g transform={`translate(${node.w - 22}, 14)`}>
          <circle className="hero-graph-node-check-ring" cx={6} cy={6} r={7} />
          <path className="hero-graph-node-check" d="M2.6 6.2 L5 8.6 L9.6 3.6" />
        </g>
      )}
    </g>
  );
}

function EdgeLabel({ edge }: { edge: GraphEdge }) {
  if (!edge.label) return null;
  const labelClass = edge.pass
    ? "hero-graph-edge-label hero-graph-edge-label--pass"
    : edge.fail
      ? "hero-graph-edge-label hero-graph-edge-label--fail"
      : "hero-graph-edge-label";
  const width = edge.label.length * 5.8 + 14;

  return (
    <g transform={`translate(${edge.labelX}, ${edge.labelY})`}>
      <rect
        className={`hero-graph-edge-label-bg${edge.pass ? " hero-graph-edge-label-bg--pass" : ""}${edge.fail ? " hero-graph-edge-label-bg--fail" : ""}`}
        x={-width / 2}
        y={-9}
        width={width}
        height={18}
        rx={2}
      />
      <text className={labelClass} y={4}>
        {edge.label}
      </text>
    </g>
  );
}

export function HeroGraphBg() {
  const { t } = useTranslation();
  const [mobile, setMobile] = useState(false);
  const [flow, setFlow] = useState({
    cycle: 0,
    route: ["start", "archive", "tunnels", "shepherd"],
  });
  const { nodes, edges } = useMemo(
    () =>
      buildGraph(
        t("heroGraph.nodes", { returnObjects: true }) as NodeText[],
        t("heroGraph.edges", { returnObjects: true }) as EdgeText[],
      ),
    [t],
  );

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => setMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (motion.matches) return;

    const timer = window.setInterval(() => {
      setFlow((current) => ({
        cycle: current.cycle + 1,
        route: randomRoute(current.route),
      }));
    }, FLOW_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, []);

  const flowEdges = useMemo(
    () =>
      new Map(
        flow.route.slice(0, -1).map((from, step) => [`${from}-${flow.route[step + 1]}`, step]),
      ),
    [flow.route],
  );
  const flowNodes = useMemo(
    () => new Map(flow.route.map((nodeId, step) => [nodeId, step])),
    [flow.route],
  );

  return (
    <svg
      className="hero-graph-bg"
      viewBox="0 0 1200 720"
      preserveAspectRatio={mobile ? "xMidYMid slice" : "xMaxYMid slice"}
      overflow="hidden"
      aria-hidden="true"
    >
      <defs>
        <marker
          id="hero-graph-arrow"
          markerWidth="7"
          markerHeight="7"
          refX="6"
          refY="3.5"
          orient="auto"
        >
          <path className="hero-graph-arrow" d="M0,0 L7,3.5 L0,7 Z" />
        </marker>
      </defs>

      <g className="hero-graph-edges">
        {edges.map((edge) => {
          const from = getNode(nodes, edge.from);
          const to = getNode(nodes, edge.to);
          const edgeKey = `${edge.from}-${edge.to}`;
          const flowStep = flowEdges.get(edgeKey);
          return (
            <g key={edgeKey}>
              <path
                className="hero-graph-edge"
                d={edgePath(from, to)}
                markerEnd="url(#hero-graph-arrow)"
              />
              {flowStep !== undefined && (
                <path
                  key={`${flow.cycle}-${edgeKey}`}
                  className="hero-graph-edge-flow"
                  d={edgePath(from, to)}
                  pathLength={1}
                  style={{ "--hero-flow-step": flowStep } as CSSProperties}
                />
              )}
              <EdgeLabel edge={edge} />
            </g>
          );
        })}
      </g>

      <g className="hero-graph-nodes">
        {nodes.map((node) => (
          <GraphNodeCard
            key={`${flow.cycle}-${node.id}`}
            node={node}
            flowStep={flowNodes.get(node.id)}
          />
        ))}
      </g>
    </svg>
  );
}
