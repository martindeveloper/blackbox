export const HEATMAP_SCHEMA_VERSION = 2;
export const CHECKPOINTS_SCHEMA_VERSION = 1;
export const PREVIEW_CHECKPOINT_FORMAT = "blackbox-preview-checkpoint";

function isAnalyticsRow(value) {
  return (
    value &&
    typeof value === "object" &&
    typeof value.id === "string" &&
    Number.isFinite(value.count) &&
    Number.isFinite(value.total) &&
    Number.isFinite(value.pct)
  );
}

function isTrafficRow(value) {
  return (
    value &&
    typeof value === "object" &&
    typeof value.id === "string" &&
    Number.isFinite(value.visits) &&
    Number.isFinite(value.reach) &&
    Number.isFinite(value.reachPct) &&
    Number.isFinite(value.outDegree)
  );
}

function isPerEnding(value) {
  return (
    value &&
    typeof value === "object" &&
    typeof value.ending === "string" &&
    Number.isFinite(value.pathCount) &&
    Array.isArray(value.nodes) &&
    value.nodes.every(
      (node) =>
        node &&
        typeof node === "object" &&
        typeof node.id === "string" &&
        Number.isFinite(node.reach) &&
        Number.isFinite(node.reachPct),
    )
  );
}

export function normalizeAnalytics(value) {
  if (!value || typeof value !== "object") return null;
  const nodeTraffic = Array.isArray(value.nodeTraffic)
    ? value.nodeTraffic
    : Array.isArray(value.hotNodes)
      ? value.hotNodes
      : null;
  if (
    !Array.isArray(value.mandatoryNodes) ||
    !value.mandatoryNodes.every((node) => typeof node === "string") ||
    !Number.isFinite(value.totalEndings) ||
    !Array.isArray(value.nodeImportance ?? value.importance) ||
    !(value.nodeImportance ?? value.importance).every(isAnalyticsRow) ||
    !Array.isArray(value.importance) ||
    !value.importance.every(isAnalyticsRow) ||
    !Number.isFinite(value.totalPaths) ||
    !Array.isArray(value.accessibility) ||
    !value.accessibility.every(isAnalyticsRow) ||
    !nodeTraffic ||
    !nodeTraffic.every(isTrafficRow) ||
    !Array.isArray(value.hotNodes) ||
    !value.hotNodes.every(isTrafficRow) ||
    !Array.isArray(value.splitCandidates) ||
    !value.splitCandidates.every(isTrafficRow) ||
    !Array.isArray(value.perEnding) ||
    !value.perEnding.every(isPerEnding)
  ) {
    return null;
  }
  return {
    ...value,
    nodeImportance: value.nodeImportance ?? value.importance,
    nodeTraffic,
  };
}

export function normalizeHeatmapRecord(value) {
  if (!value || typeof value !== "object") return null;
  const analytics = normalizeAnalytics(value.analytics);
  if (!analytics || !Number.isFinite(value.capturedAt)) return null;
  return {
    version: value.version === HEATMAP_SCHEMA_VERSION ? HEATMAP_SCHEMA_VERSION : 1,
    analytics,
    meta: value.meta && typeof value.meta === "object" ? value.meta : null,
    capturedAt: value.capturedAt,
    contentFingerprint:
      typeof value.contentFingerprint === "string" ? value.contentFingerprint : null,
    sourceRevision: Number.isFinite(value.sourceRevision) ? value.sourceRevision : null,
    scenarioRevision: typeof value.scenarioRevision === "string" ? value.scenarioRevision : null,
    runId: typeof value.runId === "string" ? value.runId : null,
  };
}

export function normalizeCheckpointSummary(value) {
  if (!value || typeof value !== "object") return null;
  const id = typeof value.id === "string" ? value.id.trim() : "";
  const createdAt = typeof value.createdAt === "string" ? value.createdAt : null;
  if (!id || !createdAt) return null;
  return {
    id,
    createdAt,
    nodeId: typeof value.nodeId === "string" ? value.nodeId : null,
    chapterId: typeof value.chapterId === "string" ? value.chapterId : null,
    location: typeof value.location === "string" ? value.location : null,
  };
}

export function normalizeCheckpointRecord(value) {
  if (!value || typeof value !== "object") return null;
  if (value.format !== PREVIEW_CHECKPOINT_FORMAT) return null;
  if (value.version !== CHECKPOINTS_SCHEMA_VERSION) return null;
  const summary = normalizeCheckpointSummary(value);
  if (!summary) return null;
  const storage = value.storage;
  const engineState = typeof value.engineState === "string" ? value.engineState.trim() : "";
  if (
    !storage ||
    typeof storage !== "object" ||
    Array.isArray(storage) ||
    engineState.length === 0
  ) {
    return null;
  }
  return {
    format: PREVIEW_CHECKPOINT_FORMAT,
    version: CHECKPOINTS_SCHEMA_VERSION,
    ...summary,
    storage,
    engineState,
  };
}

export function normalizeCheckpointManifest(value) {
  if (!value || typeof value !== "object")
    return { version: CHECKPOINTS_SCHEMA_VERSION, checkpoints: [] };
  const checkpoints = Array.isArray(value.checkpoints)
    ? value.checkpoints.map(normalizeCheckpointSummary).filter(Boolean)
    : [];
  return {
    version: value.version === CHECKPOINTS_SCHEMA_VERSION ? CHECKPOINTS_SCHEMA_VERSION : 1,
    checkpoints,
  };
}
