export const API_VERSION = "v1";
export const API_PREFIX = `/api/${API_VERSION}`;

export const GlobalRoutes = {
  Prefs: "/prefs",
  Players: "/players",
  Projects: "/projects",
  ProjectsRegister: "/projects/register",
  ProjectsCreate: "/projects/create",
  ProjectsRevokeCodeTrust: "/projects/revoke-code-trust",
};

export const ProjectRoutes = {
  Open: "/open",
  Delete: "/delete",
  TrustCode: "/trust-code",
  BootstrapCode: "/bootstrap-code",
  Events: "/events",
  Heatmap: "/heatmap",
  Documents: "/documents",
  Media: "/media",
  MediaTrash: "/media/trash",
  TrashRestore: "/trash/restore",
  TrashDelete: "/trash/delete",
  TrashEmpty: "/trash/empty",
  PreviewDocs: "/preview-docs",
  PreviewBuild: "/preview-build",
  PreviewCheckpoints: "/preview-checkpoints",
  ToolsDiscover: "/tools/discover",
  ToolsBuild: "/tools/build",
  ToolsRuns: "/tools/runs",
  BuildCapabilities: "/build/capabilities",
  BuildRuns: "/build/runs",
  BuildRunsCurrent: "/build/runs/current",
  BuildRunsStream: "/build/runs/stream",
  Vcs: "/vcs",
  VcsStatus: "/vcs/status",
  VcsOperations: "/vcs/operations",
  VcsHistory: "/vcs/history",
};

export function globalApiUrl(route) {
  return `${API_PREFIX}${route}`;
}

export function projectApiUrl(projectId, suffix = "") {
  return `${API_PREFIX}/projects/${encodeURIComponent(projectId)}${suffix}`;
}

export function projectMediaUrl(projectId, relativePath, revision) {
  const encoded = relativePath.split("/").map(encodeURIComponent).join("/");
  return `${projectApiUrl(projectId, `${ProjectRoutes.Media}/${encoded}`)}?revision=${revision}`;
}

export function projectToolsRunUrl(projectId, tool) {
  return projectApiUrl(projectId, `${ProjectRoutes.ToolsRuns}/${tool}`);
}

export function projectBuildRunCancelUrl(projectId, runId) {
  return projectApiUrl(projectId, `${ProjectRoutes.BuildRuns}/${encodeURIComponent(runId)}/cancel`);
}

export function serverProjectRoute(suffix) {
  return `/projects/:id${suffix}`;
}

export function serverProjectMediaRoute() {
  return `${serverProjectRoute(ProjectRoutes.Media)}/*`;
}

export function serverToolsRunRoute() {
  return `${serverProjectRoute(ProjectRoutes.ToolsRuns)}/:tool`;
}

export function serverBuildRunCancelRoute() {
  return `${serverProjectRoute(ProjectRoutes.BuildRuns)}/:runId/cancel`;
}

export function serverPreviewCheckpointRoute() {
  return `${serverProjectRoute(ProjectRoutes.PreviewCheckpoints)}/:checkpointId`;
}

export function serverVcsOperationRoute() {
  return `${serverProjectRoute(ProjectRoutes.VcsOperations)}/:operation`;
}

export const Api = {
  Prefs: globalApiUrl(GlobalRoutes.Prefs),
  Players: globalApiUrl(GlobalRoutes.Players),
  Projects: globalApiUrl(GlobalRoutes.Projects),
  ProjectsRegister: globalApiUrl(GlobalRoutes.ProjectsRegister),
  ProjectsCreate: globalApiUrl(GlobalRoutes.ProjectsCreate),
  ProjectsRevokeCodeTrust: globalApiUrl(GlobalRoutes.ProjectsRevokeCodeTrust),
};
