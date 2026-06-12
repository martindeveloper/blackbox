import { useEffect, useState } from "react";

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

const NODES: GraphNode[] = [
  {
    id: "start",
    x: 700,
    y: 48,
    w: 178,
    h: 64,
    sid: "prologue_arrival",
    title: "Prologue · Arrival",
    meta: "1 choice",
    accent: true,
  },
  {
    id: "archive",
    x: 502,
    y: 188,
    w: 196,
    h: 72,
    sid: "archive_terminal",
    title: "Archive Terminal",
    meta: "3 choices",
  },
  {
    id: "security",
    x: 812,
    y: 192,
    w: 200,
    h: 72,
    sid: "security_door",
    title: "Security Door",
    meta: "2 choices",
    accent: true,
  },
  {
    id: "tunnels",
    x: 452,
    y: 336,
    w: 210,
    h: 76,
    sid: "lower_service_tunn…",
    title: "Lower Service Tunnels",
    meta: "5 choices",
  },
  {
    id: "chapel",
    x: 712,
    y: 340,
    w: 204,
    h: 76,
    sid: "chapel_hatch_seq…",
    title: "Chapel Hatch Sequence",
    meta: "4 choices",
  },
  {
    id: "server",
    x: 968,
    y: 336,
    w: 184,
    h: 72,
    sid: "server_room",
    title: "Server Room",
    meta: "2 choices",
  },
  {
    id: "shepherd",
    x: 356,
    y: 540,
    w: 198,
    h: 80,
    sid: "ending_last_shepherd",
    title: "Last Shepherd",
    meta: "168 states · 62 ch",
    ending: "orange",
  },
  {
    id: "question",
    x: 576,
    y: 576,
    w: 200,
    h: 80,
    sid: "ending_open_question",
    title: "Open Question",
    meta: "161 states · 64 ch",
    ending: "blue",
  },
  {
    id: "protocol",
    x: 800,
    y: 540,
    w: 210,
    h: 80,
    sid: "ending_protocol_main…",
    title: "Protocol Maintained",
    meta: "142 states · 61 ch",
    ending: "green",
  },
  {
    id: "witness",
    x: 1026,
    y: 576,
    w: 200,
    h: 80,
    sid: "ending_witness_proto…",
    title: "Witness Protocol",
    meta: "200 states · 77 ch",
    ending: "amber",
  },
];

const EDGES: GraphEdge[] = [
  { from: "start", to: "archive", label: "Enter archive", labelX: 612, labelY: 150 },
  { from: "start", to: "security", label: "Check door", labelX: 800, labelY: 150 },
  { from: "archive", to: "tunnels", label: "Descend stairs", labelX: 540, labelY: 300 },
  { from: "security", to: "chapel", label: "Pass — Whisper", labelX: 820, labelY: 300, pass: true },
  { from: "security", to: "server", label: "Fail — Force", labelX: 980, labelY: 300, fail: true },
  { from: "tunnels", to: "shepherd", label: "Unlock hatch", labelX: 470, labelY: 484 },
  { from: "tunnels", to: "question", label: "Wait", labelX: 612, labelY: 490 },
  { from: "chapel", to: "question", label: "Confess", labelX: 720, labelY: 492 },
  { from: "chapel", to: "protocol", label: "Comply", labelX: 832, labelY: 484 },
  { from: "server", to: "protocol", label: "Bridge net", labelX: 962, labelY: 486 },
  { from: "server", to: "witness", label: "Broadcast", labelX: 1080, labelY: 486 },
];

function getNode(id: string): GraphNode {
  const node = NODES.find((n) => n.id === id);
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

function GraphNodeCard({ node }: { node: GraphNode }) {
  const boxClass = node.ending
    ? `hero-graph-node-box hero-graph-node-box--ending hero-graph-node-box--ending-${node.ending}`
    : `hero-graph-node-box${node.accent ? " hero-graph-node-box--accent" : ""}`;
  const idClass = node.ending
    ? `hero-graph-node-id hero-graph-node-id--ending-${node.ending}`
    : "hero-graph-node-id";

  return (
    <g className="hero-graph-node" transform={`translate(${node.x}, ${node.y})`}>
      <rect className={boxClass} width={node.w} height={node.h} rx={4} />
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
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => setMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

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
        {EDGES.map((edge) => {
          const from = getNode(edge.from);
          const to = getNode(edge.to);
          return (
            <g key={`${edge.from}-${edge.to}`}>
              <path
                className="hero-graph-edge"
                d={edgePath(from, to)}
                markerEnd="url(#hero-graph-arrow)"
              />
              <EdgeLabel edge={edge} />
            </g>
          );
        })}
      </g>

      <g className="hero-graph-nodes">
        {NODES.map((node) => (
          <GraphNodeCard key={node.id} node={node} />
        ))}
      </g>
    </svg>
  );
}
