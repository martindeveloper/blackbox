import path from "node:path";
import { fileURLToPath } from "node:url";

const MANIFEST_DIR = path.dirname(fileURLToPath(import.meta.url));

export const EDITOR_ROOT = path.resolve(MANIFEST_DIR, "../..");
export const REPO_ROOT = path.resolve(EDITOR_ROOT, "../..");

export const PLAYER_ID = "web";

export const manifest = {
  id: PLAYER_ID,
  label: "Web",
  capabilities: {
    livePreview: true,
    bundle: true,
    projectScaffold: true,
  },
};

export const STAGED_WORKSPACE_DIR = path.join(
  EDITOR_ROOT,
  "resources",
  "players",
  "web",
  "workspace",
);

export const PACKAGED_WORKSPACE_REL = path.join("players", "web", "workspace");

export const PROTOCOL_PATH = path.join(MANIFEST_DIR, "protocol.ts");

export function devEngineRoot() {
  return path.join(REPO_ROOT, "apps", "web");
}

export function resolveWorkspaceRoot(env = process.env, clientRoot = EDITOR_ROOT) {
  if (env.BLACKBOX_PLAYER_WEB_WORKSPACE) {
    return path.resolve(env.BLACKBOX_PLAYER_WEB_WORKSPACE);
  }
  if (env.BLACKBOX_PREVIEW_WEB_ROOT) {
    return path.resolve(env.BLACKBOX_PREVIEW_WEB_ROOT);
  }
  return path.join(path.resolve(clientRoot, "../.."), "apps", "web");
}
