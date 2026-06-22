import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { BundleGraphNodeData } from "@/lib/bundleGraphBuilder.js";

function formatBytes(
  t: (key: string, options?: Record<string, unknown>) => string,
  bytes: number,
): string {
  if (bytes < 1024) return t("tools.parsed.bytes.b", { n: bytes });
  if (bytes < 1024 * 1024) {
    return t("tools.parsed.bytes.kib", { n: (bytes / 1024).toFixed(1) });
  }
  return t("tools.parsed.bytes.mib", { n: (bytes / (1024 * 1024)).toFixed(2) });
}

const CHAPTER_ACCENTS = [
  "var(--bundle-graph-chapter-1)",
  "var(--bundle-graph-chapter-2)",
  "var(--bundle-graph-chapter-3)",
  "var(--bundle-graph-chapter-4)",
  "var(--bundle-graph-chapter-5)",
  "var(--bundle-graph-chapter-6)",
];

export function BundleGraphNode({ data, selected }: NodeProps) {
  const { t } = useTranslation();
  const nodeData = data as BundleGraphNodeData;
  const isShared = nodeData.kind === "SHARED";
  const accent =
    nodeData.accentIndex >= 0
      ? CHAPTER_ACCENTS[nodeData.accentIndex % CHAPTER_ACCENTS.length]
      : "var(--bundle-graph-shared)";

  return (
    <div
      className={`bundle-graph-node${isShared ? " bundle-graph-node--shared" : " bundle-graph-node--chapter"}${selected ? " bundle-graph-node--selected" : ""}`}
      style={{ "--bundle-node-accent": accent } as CSSProperties}
    >
      <span className="bundle-graph-node-kind">{nodeData.kind}</span>
      <span className="bundle-graph-node-label" title={nodeData.label}>
        {nodeData.label}
      </span>
      <div className="bundle-graph-node-stats">
        <span>{t("tools.bundle.graphEntries", { count: nodeData.entryCount })}</span>
        <span className="bundle-graph-node-stat-sep" aria-hidden />
        <span>{formatBytes(t, nodeData.blobBytes)}</span>
        {nodeData.depCount > 0 && (
          <>
            <span className="bundle-graph-node-stat-sep" aria-hidden />
            <span>{t("tools.bundle.graphDeps", { count: nodeData.depCount })}</span>
          </>
        )}
      </div>
      <Handle type="target" position={Position.Top} className="bundle-graph-handle" />
      <Handle type="source" position={Position.Bottom} className="bundle-graph-handle" />
    </div>
  );
}
