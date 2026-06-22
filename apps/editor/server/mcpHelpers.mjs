import { createHash, timingSafeEqual } from "node:crypto";

export const HOST = "127.0.0.1";
export const MCP_PATH = "/mcp";
export const MAX_BODY_BYTES = 2 * 1024 * 1024;
export const MAX_UPLOAD_BODY_BYTES = 32 * 1024 * 1024;
export const MAX_MEDIA_BYTES = 24 * 1024 * 1024;
export const UPLOAD_TOOL = "upload_media";
export const MAX_PATCH_OPS = 500;
export const CHAPTER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

const SCOUT_RECORD_COLLECTION = {
  item: "item",
  character: "character",
  flag: "flag",
  event: "event",
  texture: "texture",
  music: "music",
  sfx: "sound",
};

export function scoutPatchLocator(hit) {
  if (hit.category === "node") {
    const chapterId = hit.chapter ?? hit.focus?.params?.chapter ?? null;
    return chapterId ? { op: "set_node", chapterId, nodeId: hit.id } : null;
  }
  const collection = SCOUT_RECORD_COLLECTION[hit.category];
  return collection ? { op: "set_record", collection, id: hit.id } : null;
}

export function jsonText(value) {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  };
}

export function toolError(error) {
  const code = typeof error?.code === "string" ? error.code : "mcp_tool_error";
  const message = error instanceof Error ? error.message : String(error);
  const details = error?.details && typeof error.details === "object" ? error.details : undefined;
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify({ code, message, ...details }, null, 2) }],
  };
}

export function newChapterDocument({ id, title, startNodeId }) {
  return {
    spec: "com.blackbox.chapter",
    formatVersion: 1,
    id,
    title,
    startNodeId,
    nodes: {
      [startNodeId]: {
        id: startNodeId,
        title,
        text: [{ kind: "paragraph", text: "Your story begins here." }],
        choices: [],
      },
    },
  };
}

export function publicProject(project) {
  return {
    id: project.id,
    name: project.name,
    title: project.title,
    revision: project.revision,
    lastOpened: project.lastOpened,
    codeTrusted: project.codeTrusted,
    hasCustomCode: project.hasCustomCode,
  };
}

export function publicSnapshot(snapshot, { includeLayout = false, includeMedia = false } = {}) {
  const { scenarioDir: _scenarioDir, ...bundle } = { ...snapshot.bundle };
  if (!includeLayout) delete bundle.layout;
  return {
    project: publicProject(snapshot.project),
    bundle,
    ...(includeMedia ? { mediaFiles: snapshot.mediaFiles } : {}),
  };
}

export function findNode(snapshot, chapterId, nodeId) {
  if (chapterId === "scenario") {
    const node = snapshot.bundle.scenario.nodes?.[nodeId];
    return node ? { chapterId, nodeId, node } : null;
  }
  const chapter = snapshot.bundle.chapters[chapterId];
  const node = chapter?.nodes?.[nodeId];
  return node ? { chapterId, chapterTitle: chapter.title, nodeId, node } : null;
}

export async function readJsonBody(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_UPLOAD_BODY_BYTES) {
      const error = new Error("MCP request body is too large");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) return { value: undefined, size: 0 };
  return { value: JSON.parse(Buffer.concat(chunks).toString("utf8")), size };
}

export function isUploadCall(body) {
  const messages = Array.isArray(body) ? body : [body];
  return messages.some(
    (message) => message?.method === "tools/call" && message?.params?.name === UPLOAD_TOOL,
  );
}

export function tokenMatches(header, token) {
  if (typeof header !== "string" || !header.startsWith("Bearer ")) return false;
  const supplied = header.slice(7);
  const expectedHash = createHash("sha256").update(token).digest();
  const suppliedHash = createHash("sha256").update(supplied).digest();
  return timingSafeEqual(expectedHash, suppliedHash);
}

export function sendJson(response, statusCode, value, headers = {}) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...headers,
  });
  response.end(JSON.stringify(value));
}

export function auditArguments(tool, args) {
  const summary = {};
  for (const key of [
    "projectId",
    "chapterId",
    "nodeId",
    "expectedRevision",
    "includeLayout",
    "includeMedia",
    "mode",
    "goalBudget",
    "maxStates",
    "threads",
    "heuristic",
    "check",
    "analytics",
    "platform",
    "ignoreMissing",
    "targetDir",
  ]) {
    if (args?.[key] !== undefined) summary[key] = args[key];
  }
  if (tool === "save_documents" && args?.documents && typeof args.documents === "object") {
    summary.documentPaths = Object.keys(args.documents);
  }
  if (tool === "patch_documents" && Array.isArray(args?.ops)) {
    summary.opCount = args.ops.length;
    summary.opTypes = [...new Set(args.ops.map((op) => op?.op).filter(Boolean))];
  }
  if (tool === "upload_media" && typeof args?.filename === "string") {
    summary.filename = args.filename.slice(0, 160);
  }
  if (tool === "add_chapter" && typeof args?.id === "string") {
    summary.chapterId = args.id;
  }
  if (tool === "lint_project") {
    summary.ignoreCount = Array.isArray(args?.ignore) ? args.ignore.length : 0;
    summary.onlyCount = Array.isArray(args?.only) ? args.only.length : 0;
  }
  return summary;
}
