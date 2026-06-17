import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveProject } from "../adventure.mjs";
import { createHostCache } from "./host.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function getCliDir() {
  return process.env.BLACKBOX_CLI_DIR ? path.resolve(process.env.BLACKBOX_CLI_DIR) : REPO_ROOT;
}

export function capacitorBin() {
  const name = process.platform === "win32" ? "cap.cmd" : "cap";
  return path.join(getCliDir(), "apps", "mobile", "node_modules", ".bin", name);
}

/** @param {string | null | undefined} projectPath */
export function loadProjectContext(projectPath) {
  if (!projectPath) return null;
  try {
    return resolveProject(projectPath, { configuration: "release" });
  } catch {
    return null;
  }
}

/** @param {string | null | undefined} projectPath */
export function createPreflightContext(projectPath) {
  return {
    projectPath: projectPath ? String(projectPath) : null,
    project: loadProjectContext(projectPath),
    host: createHostCache(),
  };
}

/** @param {ReturnType<typeof resolveProject>} project */
export function createPreflightContextFromProject(project) {
  return {
    projectPath: project.root,
    project,
    host: createHostCache(),
  };
}
