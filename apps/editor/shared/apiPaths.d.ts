export const API_VERSION: "v1";
export const API_PREFIX: string;

export const GlobalRoutes: {
  readonly Prefs: "/prefs";
  readonly Players: "/players";
  readonly Projects: "/projects";
  readonly ProjectsRegister: "/projects/register";
  readonly ProjectsCreate: "/projects/create";
  readonly ProjectsRevokeCodeTrust: "/projects/revoke-code-trust";
};

export const ProjectRoutes: {
  readonly Open: "/open";
  readonly Delete: "/delete";
  readonly TrustCode: "/trust-code";
  readonly BootstrapCode: "/bootstrap-code";
  readonly Events: "/events";
  readonly Heatmap: "/heatmap";
  readonly Documents: "/documents";
  readonly Media: "/media";
  readonly MediaTrash: "/media/trash";
  readonly TrashRestore: "/trash/restore";
  readonly TrashDelete: "/trash/delete";
  readonly TrashEmpty: "/trash/empty";
  readonly PreviewDocs: "/preview-docs";
  readonly PreviewBuild: "/preview-build";
  readonly PreviewCheckpoints: "/preview-checkpoints";
  readonly ToolsDiscover: "/tools/discover";
  readonly ToolsBuild: "/tools/build";
  readonly ToolsRuns: "/tools/runs";
  readonly Scout: "/scout";
  readonly BuildCapabilities: "/build/capabilities";
  readonly BuildRuns: "/build/runs";
  readonly BuildRunsCurrent: "/build/runs/current";
  readonly BuildRunsStream: "/build/runs/stream";
  readonly Vcs: "/vcs";
  readonly VcsStatus: "/vcs/status";
  readonly VcsCheck: "/vcs/check";
  readonly VcsSync: "/vcs/sync";
  readonly VcsOperations: "/vcs/operations";
  readonly VcsHistory: "/vcs/history";
};

export function globalApiUrl(route: string): string;
export function projectApiUrl(projectId: string, suffix?: string): string;
export function projectMediaUrl(projectId: string, relativePath: string, revision: number): string;
export function projectToolsRunUrl(projectId: string, tool: string): string;
export function projectScoutUrl(
  projectId: string,
  options?: { query?: string; only?: string[]; limit?: number; fullText?: boolean },
): string;
export function projectBuildRunCancelUrl(projectId: string, runId: string): string;
export function serverProjectRoute(suffix: string): string;
export function serverProjectMediaRoute(): string;
export function serverToolsRunRoute(): string;
export function serverBuildRunCancelRoute(): string;
export function serverPreviewCheckpointRoute(): string;
export function serverVcsOperationRoute(): string;

export const Api: {
  readonly Prefs: string;
  readonly Players: string;
  readonly Projects: string;
  readonly ProjectsRegister: string;
  readonly ProjectsCreate: string;
  readonly ProjectsRevokeCodeTrust: string;
};
