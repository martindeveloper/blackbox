/**
 * Turns id-addressed patch operations into a minimal set of full JSON documents
 * for `projectService.saveDocuments`. The agent never re-emits a whole document,
 * so a single edit can no longer silently drop unrelated nodes — only the touched
 * documents are rewritten, and only the addressed entities within them change.
 *
 * The output feeds the same atomic, revision-checked save and audit-diff pipeline
 * that `save_documents` uses, so concurrency and logging behave identically.
 */

const COLLECTIONS = {
  item: { doc: "items", key: "items" },
  character: { doc: "characters", key: "characters" },
  event: { doc: "meta", key: "events" },
  flag: { doc: "meta", key: "flags" },
  texture: { doc: "assets", key: "textures" },
  music: { doc: "assets", key: "music" },
  sound: { doc: "assets", key: "sfx" },
  snippet: { doc: "library", key: "snippets" },
  template: { doc: "library", key: "templates" },
  condition: { doc: "library", key: "conditions" },
};

export const PATCH_COLLECTIONS = Object.keys(COLLECTIONS);

function patchError(code, message) {
  return Object.assign(new Error(message), { code });
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function requireId(value, label) {
  if (!isObject(value) || typeof value.id !== "string" || value.id.length === 0) {
    throw patchError("invalid_request", `${label} must be an object with a non-empty string id`);
  }
  return value.id;
}

/**
 * @param {object} snapshot - result of projectService.openProject
 * @param {Array<object>} ops - validated patch operations
 * @returns {Record<string, unknown>} documents keyed by relative path
 */
export function applyDocumentPatch(snapshot, ops) {
  const bundle = snapshot?.bundle ?? {};
  const filePaths = bundle.filePaths ?? {};
  const working = new Map();

  // Lazily clone a document the first time an op touches it, so unrelated
  // documents are never rewritten.
  const loadDoc = (path, source) => {
    if (!working.has(path)) working.set(path, structuredClone(source));
    return working.get(path);
  };

  const resolveChapter = (chapterId) => {
    if (chapterId === "scenario") {
      return { path: filePaths.scenario, source: bundle.scenario };
    }
    const path = filePaths.chapters?.[chapterId];
    const source = bundle.chapters?.[chapterId];
    if (!path || !isObject(source)) {
      throw patchError("not_found", `Unknown chapter: ${chapterId}`);
    }
    return { path, source };
  };

  const resolveCollection = (collection) => {
    const mapping = COLLECTIONS[collection];
    if (!mapping) {
      throw patchError("invalid_request", `Unknown collection: ${collection}`);
    }
    const path = filePaths[mapping.doc];
    const source = bundle[mapping.doc];
    if (!path || !isObject(source)) {
      throw patchError(
        "not_found",
        `No ${mapping.doc} document exists for ${collection}; create it with save_documents first`,
      );
    }
    return { path, source, key: mapping.key };
  };

  const nodeAt = (doc, chapterId, nodeId) => {
    const node = isObject(doc.nodes) ? doc.nodes[nodeId] : undefined;
    if (!isObject(node)) {
      throw patchError("not_found", `Node not found: ${chapterId}/${nodeId}`);
    }
    return node;
  };

  for (const op of ops) {
    switch (op.op) {
      case "set_node": {
        const { path, source } = resolveChapter(op.chapterId);
        const id = requireId(op.node, "node");
        const doc = loadDoc(path, source);
        if (!isObject(doc.nodes)) doc.nodes = {};
        doc.nodes[id] = op.node;
        break;
      }
      case "remove_node": {
        const { path, source } = resolveChapter(op.chapterId);
        const doc = loadDoc(path, source);
        if (!isObject(doc.nodes) || !(op.nodeId in doc.nodes)) {
          throw patchError("not_found", `Node not found: ${op.chapterId}/${op.nodeId}`);
        }
        delete doc.nodes[op.nodeId];
        break;
      }
      case "set_choice": {
        const { path, source } = resolveChapter(op.chapterId);
        const choiceId = requireId(op.choice, "choice");
        const doc = loadDoc(path, source);
        const node = nodeAt(doc, op.chapterId, op.nodeId);
        if (!Array.isArray(node.choices)) node.choices = [];
        const index = node.choices.findIndex((c) => isObject(c) && c.id === choiceId);
        if (index >= 0) node.choices[index] = op.choice;
        else node.choices.push(op.choice);
        break;
      }
      case "remove_choice": {
        const { path, source } = resolveChapter(op.chapterId);
        const doc = loadDoc(path, source);
        const node = nodeAt(doc, op.chapterId, op.nodeId);
        const before = Array.isArray(node.choices) ? node.choices : [];
        const next = before.filter((c) => !(isObject(c) && c.id === op.choiceId));
        if (next.length === before.length) {
          throw patchError(
            "not_found",
            `Choice not found: ${op.chapterId}/${op.nodeId}/${op.choiceId}`,
          );
        }
        node.choices = next;
        break;
      }
      case "set_record": {
        const { path, source, key } = resolveCollection(op.collection);
        const doc = loadDoc(path, source);
        if (!isObject(doc[key])) doc[key] = {};
        doc[key][op.id] = op.value;
        break;
      }
      case "remove_record": {
        const { path, source, key } = resolveCollection(op.collection);
        const doc = loadDoc(path, source);
        if (!isObject(doc[key]) || !(op.id in doc[key])) {
          throw patchError("not_found", `${op.collection} not found: ${op.id}`);
        }
        delete doc[key][op.id];
        break;
      }
      default:
        throw patchError("invalid_request", `Unknown patch operation: ${String(op.op)}`);
    }
  }

  return Object.fromEntries(working);
}
