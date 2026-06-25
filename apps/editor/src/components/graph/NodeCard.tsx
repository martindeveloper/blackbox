import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  Bot,
  GitBranch,
  Layers,
  Link2,
  Quote,
  Settings2,
  Skull,
  Star,
  UserRound,
} from "lucide-react";
import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import type { ScenarioNodeData } from "@/lib/graphBuilder.js";
import { Icon } from "@/components/icons/Icon.js";

export function NodeCard({ data, selected }: NodeProps) {
  const { t } = useTranslation();
  const d = data as ScenarioNodeData;
  const hasAnalytics = d.analyticsActive === true;
  const intensity = d.analyticsIntensity ?? 0;
  const active = selected || d.inspectorSelected === true;
  const contributor = d.recentlyChangedBy;

  const analyticsStyle: CSSProperties | undefined = hasAnalytics
    ? ({
        "--insight": intensity,
        ...(d.analyticsColor ? { "--insight-color": d.analyticsColor } : {}),
        animationDelay: `${Math.min(d.analyticsRank ?? 0, 24) * 35}ms`,
      } as CSSProperties)
    : undefined;

  return (
    <div
      className={`graph-node ${active ? "graph-node-selected" : ""}${contributor ? " graph-node--recently-changed" : ""}${hasAnalytics ? ` graph-node--analytics graph-node--analytics-${d.analyticsTone ?? "reach"}${intensity <= 0 ? " graph-node--analytics-cold" : ""}` : ""}`}
      style={analyticsStyle}
    >
      {d.incomingHandles.length > 0 ? (
        d.incomingHandles.map((handleId, index) => (
          <Handle
            key={handleId}
            id={handleId}
            type="target"
            position={Position.Top}
            style={{
              left: `${((index + 1) / (d.incomingHandles.length + 1)) * 100}%`,
            }}
          />
        ))
      ) : (
        <Handle type="target" position={Position.Top} />
      )}
      <div className="flex items-center justify-between gap-1 mb-1">
        <span className="graph-node-id truncate flex-1">{d.nodeId}</span>
        <div className="flex shrink-0 items-center gap-1">
          {contributor ? (
            <span
              className="graph-node-badge graph-node-badge--contributor"
              title={t("graph.changedByContributor", { contributor: contributor.name })}
            >
              <Icon icon={contributorIcon(contributor.kind)} size={9} strokeWidth={2} />
              {contributorBadge(contributor)}
            </span>
          ) : null}
          {hasAnalytics && d.analyticsBadge ? (
            <span className="graph-node-badge graph-node-analytics-badge" title={d.analyticsTitle}>
              {d.analyticsBadge}
            </span>
          ) : null}
          {d.analyticsMarkers?.includes("spine") && d.analyticsBadge !== t("graph.heatmap.insights.badgeSpine") ? (
            <span
              className="graph-node-badge graph-node-analytics-marker"
              title={t("graph.heatmap.markerSpine")}
            >
              SP
            </span>
          ) : null}
          {d.analyticsMarkers?.includes("split") && d.analyticsBadge !== t("graph.heatmap.insights.badgeSplit") ? (
            <span
              className="graph-node-badge graph-node-analytics-marker"
              title={t("graph.heatmap.markerSplit")}
            >
              BR
            </span>
          ) : null}
          {d.isStart ? (
            <span className="graph-node-badge graph-node-badge--start">
              <Icon icon={Star} size={9} strokeWidth={2} />
              {t("graph.start")}
            </span>
          ) : null}
          {d.isDeath ? <Icon icon={Skull} size={10} className="text-danger" /> : null}
          {d.isGameOver ? (
            <span className="graph-node-badge graph-node-badge--danger" title={t("graph.gameOver")}>
              {t("graph.gameOverBadge")}
            </span>
          ) : null}
          {d.isEnding ? (
            <span className="graph-node-badge graph-node-badge--success" title={t("graph.ending")}>
              {t("graph.endingBadge")}
            </span>
          ) : null}
          {d.extendsTemplate ? (
            <span
              className="graph-node-badge graph-node-badge--template"
              title={t("graph.extendsTemplate", { id: d.extendsTemplate })}
            >
              <Icon icon={Layers} size={9} strokeWidth={2} />
              {d.extendsTemplate}
            </span>
          ) : null}
          {d.snippetIds.length > 0 ? (
            <span
              className="graph-node-badge graph-node-badge--snippet"
              title={d.snippetIds.map((id) => `@${id}`).join(", ")}
            >
              <Icon icon={Quote} size={9} strokeWidth={2} />
              {d.snippetIds.length}
            </span>
          ) : null}
        </div>
      </div>
      {d.title ? (
        <div className="truncate text-[11px] text-text leading-snug mb-1.5">{d.title}</div>
      ) : null}
      <div className="flex items-center gap-1 text-[10px] text-muted-2">
        <Icon icon={GitBranch} size={10} />
        <span>{t("graph.choices", { count: d.choiceCount })}</span>
      </div>
      {d.outgoingHandles.length > 0 ? (
        d.outgoingHandles.map((handleId, index) => (
          <Handle
            key={handleId}
            id={handleId}
            type="source"
            position={Position.Bottom}
            style={{
              left: `${((index + 1) / (d.outgoingHandles.length + 1)) * 100}%`,
            }}
          />
        ))
      ) : (
        <Handle type="source" position={Position.Bottom} />
      )}
    </div>
  );
}

function contributorIcon(kind: NonNullable<ScenarioNodeData["recentlyChangedBy"]>["kind"]) {
  if (kind === "agent") return Bot;
  if (kind === "person") return UserRound;
  if (kind === "integration") return Link2;
  return Settings2;
}

function contributorBadge(contributor: NonNullable<ScenarioNodeData["recentlyChangedBy"]>) {
  if (contributor.kind === "agent") return "AI";
  if (contributor.kind === "person") {
    return (
      contributor.name
        .split(/\s+/)
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase() || "USER"
    );
  }
  if (contributor.kind === "integration") {
    return (
      contributor.name
        .replaceAll(/[^A-Za-z0-9]/g, "")
        .slice(0, 3)
        .toUpperCase() || "EXT"
    );
  }
  return "SYS";
}
