import { projectApiUrl } from "./projectApi.js";

export type BuildPlatform = "web" | "ios" | "android";
export type BuildConfiguration = "debug" | "release";
export type BuildStage = "build" | "bundle" | "package";
export type StageState = "pending" | "running" | "done" | "error" | "canceled";
export type BuildRunState = "running" | "done" | "error" | "canceled";

export const BUILD_PLATFORMS: BuildPlatform[] = ["web", "ios", "android"];
export const BUILD_CONFIGURATIONS: BuildConfiguration[] = ["debug", "release"];

export function stagesForPlatform(_platform: BuildPlatform): BuildStage[] {
  return ["bundle", "build", "package"];
}

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

export interface PackagingCapability {
  available: boolean;
  reasons: string[];
}

export interface PlatformCapability {
  available: boolean;
  reasons: string[];
  package: PackagingCapability;
}

export interface BuildCapabilities {
  web: PlatformCapability;
  ios: PlatformCapability;
  android: PlatformCapability;
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
  const res = await fetch(projectApiUrl(projectId, "/build/capabilities"));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<BuildCapabilities>;
}

export async function getCurrentBuild(projectId: string): Promise<BuildRunWithLog | null> {
  const res = await fetch(projectApiUrl(projectId, "/build/runs/current"));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { current: BuildRunWithLog | null };
  return data.current;
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
  return postJson<StartBuildResult>(projectApiUrl(projectId, "/build/runs"), request);
}

export async function cancelBuild(projectId: string, runId: string): Promise<boolean> {
  const data = await postJson<{ canceled: boolean }>(
    projectApiUrl(projectId, `/build/runs/${encodeURIComponent(runId)}/cancel`),
    {},
  );
  return data.canceled;
}

export async function clearBuildResult(projectId: string): Promise<void> {
  const response = await fetch(projectApiUrl(projectId, "/build/runs/current"), {
    method: "DELETE",
  });
  if (!response.ok) {
    const data = (await response.json()) as { message?: string };
    throw new Error(data?.message ?? `HTTP ${response.status}`);
  }
}

export function subscribeBuild(
  projectId: string,
  onEvent: (event: BuildEvent) => void,
): () => void {
  const events = new EventSource(projectApiUrl(projectId, "/build/runs/stream"));
  events.onmessage = (message) => {
    try {
      onEvent(JSON.parse(message.data) as BuildEvent);
    } catch {}
  };
  return () => events.close();
}
