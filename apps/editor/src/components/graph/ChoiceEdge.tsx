import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from "@xyflow/react";
import type { ScenarioEdgeData } from "../../lib/graphBuilder.js";

const MAX_LABEL_LENGTH = 30;
const NODE_WIDTH = 200;
const LABEL_COLUMN_GAP = 154;
const LABEL_ROW_GAP = 31;

function compactLabel(label: string): string {
  if (label.length <= MAX_LABEL_LENGTH) return label;
  return `${label.slice(0, MAX_LABEL_LENGTH - 1).trimEnd()}…`;
}

export function ChoiceEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
  style,
}: EdgeProps) {
  const edgeData = data as ScenarioEdgeData | undefined;
  const routeOffset = edgeData?.routeOffset ?? 0;
  const sourceRouteIndex = edgeData?.sourceRouteIndex ?? 0;
  const sourceRouteCount = edgeData?.sourceRouteCount ?? 1;
  const sourcePortIndex = edgeData?.sourcePortIndex ?? 0;
  const sourcePortCount = edgeData?.sourcePortCount ?? 1;
  const isLoop = source === target;
  const sourceCenterX =
    sourceX + NODE_WIDTH / 2 - ((sourcePortIndex + 1) / (sourcePortCount + 1)) * NODE_WIDTH;

  let edgePath: string;
  let labelX: number;
  let labelY: number;

  if (isLoop) {
    const loopWidth = 128 + Math.abs(routeOffset);
    edgePath = [
      `M ${sourceX} ${sourceY}`,
      `C ${sourceX + loopWidth} ${sourceY + 8},`,
      `${targetX + loopWidth} ${targetY - 8},`,
      `${targetX} ${targetY}`,
    ].join(" ");
    labelX = sourceCenterX + NODE_WIDTH / 2 + 112;
    labelY = sourceY - 50 + (edgeData?.loopIndex ?? 0) * LABEL_ROW_GAP;
  } else if (routeOffset !== 0) {
    const controlDistance = Math.max(64, Math.abs(targetY - sourceY) * 0.42);
    edgePath = [
      `M ${sourceX} ${sourceY}`,
      `C ${sourceX + routeOffset} ${sourceY + controlDistance},`,
      `${targetX + routeOffset} ${targetY - controlDistance},`,
      `${targetX} ${targetY}`,
    ].join(" ");
    const columnCount = Math.min(3, sourceRouteCount);
    const column = sourceRouteIndex % columnCount;
    const row = Math.floor(sourceRouteIndex / columnCount);
    labelX = sourceCenterX + (column - (columnCount - 1) / 2) * LABEL_COLUMN_GAP;
    labelY = sourceY + 34 + row * LABEL_ROW_GAP;
  } else {
    [edgePath] = getSmoothStepPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
      borderRadius: 10,
      offset: 24,
    });
    const columnCount = Math.min(3, sourceRouteCount);
    const column = sourceRouteIndex % columnCount;
    const row = Math.floor(sourceRouteIndex / columnCount);
    labelX = sourceCenterX + (column - (columnCount - 1) / 2) * LABEL_COLUMN_GAP;
    labelY = sourceY + 34 + row * LABEL_ROW_GAP;
  }

  const label = edgeData?.label ?? "";

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      {label ? (
        <EdgeLabelRenderer>
          <div
            className={`graph-edge-label graph-edge-label--${edgeData?.kind ?? "goto"}`}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
            title={label}
          >
            <span className="graph-edge-label-mark" aria-hidden="true" />
            <span className="graph-edge-label-text">{compactLabel(label)}</span>
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
