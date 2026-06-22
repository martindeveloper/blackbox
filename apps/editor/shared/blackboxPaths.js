export const EDITOR_SIDECAR_DIR = ".blackbox";

export const PROJECT_CONFIG_BASENAME = "project.json";
export const USER_DIRNAME = "user";
export const USER_TOOLS_BASENAME = "tools.json";
export const LAYOUT_BASENAME = "layout.json";
export const HEATMAP_BASENAME = "heatmap.json";
export const TOOL_RUNS_DIRNAME = "tool-runs";
export const TOOL_RUNS_BASENAME = "latest.json";
export const BUILD_RUNS_BASENAME = "build-runs.json";
export const CHECKPOINTS_DIRNAME = "checkpoints";
export const CHECKPOINTS_MANIFEST_BASENAME = "manifest.json";
export const TRASH_MANIFEST_BASENAME = "trash.json";
export const EDITOR_DB_BASENAME = "editor.db";
export const USER_PREFS_BASENAME = "user.preferences.json";
export const MCP_CREDENTIALS_BASENAME = "mcp-token.bin";
export const VCS_CONFIG_BASENAME = "vcs.json";

export const PROJECT_CONFIG_PATH = `${EDITOR_SIDECAR_DIR}/${PROJECT_CONFIG_BASENAME}`;
export const VCS_CONFIG_PATH = `${EDITOR_SIDECAR_DIR}/${VCS_CONFIG_BASENAME}`;
export const USER_DIR = `${EDITOR_SIDECAR_DIR}/${USER_DIRNAME}`;
// Generated, disposable, git-ignored sidecar trees. Platform builds (Gradle,
// Capacitor, web staging) churn thousands of files under these — the project
// watcher and indexer must skip them or every build floods the change stream.
export const BUILD_DIR = `${EDITOR_SIDECAR_DIR}/build`;
export const CACHE_DIR = `${EDITOR_SIDECAR_DIR}/cache`;
export const USER_TOOLS_PATH = `${USER_DIR}/${USER_TOOLS_BASENAME}`;
export const LAYOUT_PATH = `${EDITOR_SIDECAR_DIR}/${LAYOUT_BASENAME}`;
export const HEATMAP_PATH = `${EDITOR_SIDECAR_DIR}/${HEATMAP_BASENAME}`;
export const TOOL_RUNS_DIR = `${USER_DIR}/${TOOL_RUNS_DIRNAME}`;
export const TOOL_RUNS_PATH = `${TOOL_RUNS_DIR}/${TOOL_RUNS_BASENAME}`;
export const BUILD_RUNS_PATH = `${USER_DIR}/${BUILD_RUNS_BASENAME}`;
export const CHECKPOINTS_DIR = `${USER_DIR}/${CHECKPOINTS_DIRNAME}`;
export const CHECKPOINTS_MANIFEST_PATH = `${CHECKPOINTS_DIR}/${CHECKPOINTS_MANIFEST_BASENAME}`;
export const TRASH_DIR = `${EDITOR_SIDECAR_DIR}/trash`;
export const TRASH_MANIFEST = `${EDITOR_SIDECAR_DIR}/${TRASH_MANIFEST_BASENAME}`;
