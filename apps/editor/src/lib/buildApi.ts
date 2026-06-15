import { ProjectRoutes, projectApiUrl, projectBuildRunCancelUrl } from "../../shared/apiPaths.js";
import {
  BUILD_CONFIGURATIONS,
  BUILD_PLATFORMS,
  stagesForPlatform,
} from "../../shared/buildStages.js";

export type BuildPlatform = "web" | "ios" | "android";
export type BuildConfiguration = "debug" | "release";
export type BuildStage = "bundle" | "build" | "package";
export type StageState = "pending" | "running" | "done" | "error" | "canceled";
export type BuildRunState = "running" | "done" | "error" | "canceled";

export { BUILD_CONFIGURATIONS, BUILD_PLATFORMS, stagesForPlatform };

export const PLATFORM_LABEL_KEYS: Record<BuildPlatform, string> = {
  web: "build.platformWeb",
  ios: "build.platformIos",
  android: "build.platformAndroid",
};

export const CONFIGURATION_LABEL_KEYS: Record<BuildConfiguration, string> = {
  debug: "build.configDebug",
  release: "build.configRelease",
};

export interface BuildStageSnapshot {
  stage: BuildStage;
  state: StageState;
  artifact: string | null;
  log: string[];
}

export interface BuildRunSnapshot {
  id: string;
  platform: BuildPlatform;
  configuration: BuildConfiguration;
  state: BuildRunState;
  startedAt: number;
  completedAt: number | null;
  stages: BuildStageSnapshot[];
  artifact: string | null;
  error: string | null;
}

export interface BuildRunWithLog {
  run: BuildRunSnapshot;
  log: string[];
}

export type PreflightSeverity = "error" | "warning";

export interface PreflightCheck {
  severity: PreflightSeverity;
  message: string;
}

export interface StagePreflight {
  available: boolean;
  checks: PreflightCheck[];
}

export interface PlatformCapability {
  available: boolean;
  reasons: string[];
  stages: Record<BuildStage, StagePreflight>;
}

export interface BuildCapabilities {
  web: PlatformCapability;
  ios: PlatformCapability;
  android: PlatformCapability;
}

export function selectedStagesAvailable(
  capability: PlatformCapability | undefined,
  selectedStages: BuildStage[],
): boolean {
  if (!capability) return true;
  return selectedStages.every((stage) => capability.stages[stage]?.available ?? true);
}

export function emptyPlatformCapability(): PlatformCapability {
  return {
    available: true,
    reasons: [],
    stages: {
      bundle: { available: true, checks: [] },
      build: { available: true, checks: [] },
      package: { available: true, checks: [] },
    },
  };
}

export type BuildEvent =
  | { type: "snapshot"; current: BuildRunWithLog | null }
  | { type: "started"; run: BuildRunSnapshot }
  | { type: "log"; line: string }
  | { type: "stage"; stage: BuildStage; state: StageState; artifact?: string | null }
  | { type: "done"; run: BuildRunSnapshot };

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as T & { message?: string; code?: string };
  if (!response.ok && response.status !== 409) {
    throw new Error(data?.message ?? `HTTP ${response.status}`);
  }
  return data;
}

export async function getBuildCapabilities(projectId: string): Promise<BuildCapabilities> {
  const res = await fetch(projectApiUrl(projectId, ProjectRoutes.BuildCapabilities));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<BuildCapabilities>;
}

export interface StartBuildResult {
  run: BuildRunSnapshot;
  log: string[];
  alreadyRunning: boolean;
}

export async function startBuild(
  projectId: string,
  request: { platform: BuildPlatform; configuration: BuildConfiguration; stages: BuildStage[] },
): Promise<StartBuildResult> {
  return postJson<StartBuildResult>(projectApiUrl(projectId, ProjectRoutes.BuildRuns), request);
}

export async function cancelBuild(projectId: string, runId: string): Promise<boolean> {
  const data = await postJson<{ canceled: boolean }>(
    projectBuildRunCancelUrl(projectId, runId),
    {},
  );
  return data.canceled;
}

async function deleteJson(url: string): Promise<void> {
  const response = await fetch(url, { method: "DELETE" });
  if (!response.ok) {
    const data = (await response.json()) as { message?: string };
    throw new Error(data?.message ?? `HTTP ${response.status}`);
  }
}

export async function clearBuildResult(projectId: string): Promise<void> {
  await deleteJson(projectApiUrl(projectId, ProjectRoutes.BuildRunsCurrent));
}

export function subscribeBuild(
  projectId: string,
  onEvent: (event: BuildEvent) => void,
): () => void {
  const events = new EventSource(projectApiUrl(projectId, ProjectRoutes.BuildRunsStream));
  events.onmessage = (message) => {
    try {
      onEvent(JSON.parse(message.data) as BuildEvent);
    } catch {}
  };
  return () => events.close();
}
