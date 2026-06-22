import {
  ProjectRoutes,
  projectApiUrl,
  projectScoutUrl,
  projectToolsRunUrl,
} from "@shared/apiPaths.js";

export type LintSeverity = "error" | "warn" | "info";

export interface LintIssue {
  severity: LintSeverity;
  code: string;
  message: string;
  context: string | null;
  chapterFile?: string | null;
  nodeId?: string | null;
}

export interface LintSummary {
  errors: number;
  warnings: number;
  info: number;
}

export type LintResultStatus = "failed" | "passed with warnings" | "passed";

export interface LintScenario {
  path: string;
  dataRoot: string;
  issues: LintIssue[];
  summary: LintSummary;
  result: LintResultStatus;
}

export interface ParsedLintOutput {
  kind: "lint";
  scenarioCount: number;
  scenarios: LintScenario[];
  total: LintSummary;
  result: LintResultStatus;
}

export interface InspectEntry {
  status: "ok" | "WARN" | "ERROR";
  key: string;
  codec: string;
  sniffed: string;
  bytes: number;
  offset: number;
  note: string;
}

export interface CodecTotal {
  codec: string;
  files: number;
  bytes: number;
}

export interface BundleWritten {
  outputPath: string;
  size: string;
  scenario: string;
  platform: string;
  chapterCount: number | null;
  transcode: boolean;
  archive: string;
}

export interface ProjectInspectBundle {
  kind: "SHARED" | "CHAPTER";
  name: string;
  dependencies: string[];
  entryCount: number;
  blobBytes: number;
  bundleId: string | null;
  entries: InspectEntry[];
  codecTotals: CodecTotal[];
}

export interface ParsedInspect {
  dir: string;
  mapPath: string;
  boxPath: string;
  scenario: string;
  scenarioTitle: string;
  scenarioRevision: string;
  platform: string;
  entryCount: number;
  headerOk: boolean;
  entries: InspectEntry[];
  codecTotals: CodecTotal[];
  errors: string[];
  warnings: string[];
  result: "ok" | "INVALID";
  bundles: ProjectInspectBundle[];
}

export interface ParsedBundleOutput {
  kind: "bundle";
  bundle: BundleWritten | null;
  bundleStderr: string | null;
  inspect: ParsedInspect | null;
}

export type SimMode = "explore" | "goals";
export type SimHeuristic = "graph" | "none";
export type SimGoalsFilter = "ending" | "game_over" | "all" | string;

export interface SimGoalResult {
  id: string;
  reached: boolean;
  static?: boolean;
  states?: string | null;
  choices?: string;
  hint?: string | null;
}

export interface SimCoverageSlice {
  visited: number;
  total: number;
  pct: number;
}

export interface SimLogEntry {
  level: string;
  message: string;
}

export interface ParsedSimulatorFailureOutput {
  kind: "simulator";
  ok?: false;
  logs?: SimLogEntry[];
}

export interface ParsedSimulatorOutput {
  kind: "simulator";
  title: string;
  revision: string;
  mode: SimMode;
  loaded: { nodes: number; choices: number; chapters: number } | null;
  goalsReached: number | null;
  goalsTotal: number | null;
  statesExplored: string | null;
  goals: SimGoalResult[];
  coverage: {
    nodes: SimCoverageSlice | null;
    choices: SimCoverageSlice | null;
  } | null;
  issues: { severity: string; code: string | null; message: string; path?: string }[];
  issueSummary: LintSummary;
  result: LintResultStatus;
  analytics: SimAnalytics | null;
  logs?: SimLogEntry[];
}

export type ParsedSimulatorPayload = ParsedSimulatorOutput | ParsedSimulatorFailureOutput;

export function isCompleteSimulatorOutput(
  parsed: ParsedSimulatorPayload,
): parsed is ParsedSimulatorOutput {
  return "title" in parsed && "result" in parsed;
}

export interface SimOptions {
  mode: SimMode;
  goals: SimGoalsFilter;
  goalBudget: number;
  maxStates: number;
  threads: number;
  heuristic: SimHeuristic;
  check: boolean;
  verbose: boolean;
  analytics: boolean;
  storeAnalytics: boolean;
}

export const DEFAULT_SIM_OPTIONS: SimOptions = {
  mode: "goals",
  goals: "ending",
  goalBudget: 50_000,
  maxStates: 500_000,
  threads: 0,
  heuristic: "graph",
  check: false,
  verbose: false,
  analytics: false,
  storeAnalytics: false,
};

export interface SimAnalyticsRow {
  id: string;
  count: number;
  total: number;
  pct: number;
}

export interface SimHotNode {
  id: string;
  visits: number;
  reach: number;
  reachPct: number;
  outDegree: number;
}

export interface SimPerEndingNode {
  id: string;
  reach: number;
  reachPct: number;
}

export interface SimPerEnding {
  ending: string;
  pathCount: number;
  nodes: SimPerEndingNode[];
}

export interface SimAnalytics {
  mandatoryNodes: string[];
  totalEndings: number;
  nodeImportance: SimAnalyticsRow[];
  importance: SimAnalyticsRow[];
  totalPaths: number;
  accessibility: SimAnalyticsRow[];
  nodeTraffic: SimHotNode[];
  hotNodes: SimHotNode[];
  splitCandidates: SimHotNode[];
  perEnding: SimPerEnding[];
}

export const SIM_GOALS_PRESETS = ["ending", "game_over", "all"] as const;

export interface StoredAnalyticsMeta {
  mode: SimMode;
  goals: SimGoalsFilter;
  goalBudget: number;
  maxStates: number;
  threads: number;
  heuristic: SimHeuristic;
}

export interface StoredHeatmap {
  version: number;
  analytics: SimAnalytics;
  meta: StoredAnalyticsMeta | null;
  capturedAt: number;
  contentFingerprint: string | null;
  sourceRevision: number | null;
  scenarioRevision: string | null;
  runId: string | null;
}

export interface HeatmapResponse {
  stored: StoredHeatmap | null;
  path: string;
  stale: boolean;
}

export async function loadHeatmap(projectId: string): Promise<HeatmapResponse> {
  const res = await fetch(projectApiUrl(projectId, ProjectRoutes.Heatmap));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<HeatmapResponse>;
}

export async function saveHeatmap(
  projectId: string,
  payload: {
    analytics: SimAnalytics;
    meta: StoredAnalyticsMeta;
    capturedAt: number;
    sourceRevision: number | null;
    scenarioRevision: string | null;
    runId: string;
  },
): Promise<HeatmapResponse> {
  const res = await fetch(projectApiUrl(projectId, ProjectRoutes.Heatmap), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<HeatmapResponse>;
}

export async function deleteHeatmap(projectId: string): Promise<void> {
  const res = await fetch(projectApiUrl(projectId, ProjectRoutes.Heatmap), { method: "DELETE" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export interface RawOutput {
  stdout: string;
  stderr: string;
}

export interface ToolResult {
  ok: boolean;
  exitCode: number;
  raw: RawOutput;
  parsed: ParsedLintOutput | ParsedBundleOutput | ParsedSimulatorPayload | null;
  error?: string;
}

export interface ToolPhaseResult {
  ok: boolean;
  exitCode: number;
  raw: RawOutput;
}

export interface BundleToolResult extends ToolResult {
  phases?: {
    bundle: ToolPhaseResult;
    inspect: ToolPhaseResult;
  };
}

export type ToolRunState = "running" | "done" | "error";
export type ToolRunName = "linter" | "bundle" | "simulator";

interface ToolRunBase {
  id: string;
  state: ToolRunState;
  startedAt: number;
  completedAt: number | null;
  result: ToolResult | BundleToolResult | null;
}

export interface LinterRunRequest {
  expectedRevision: number;
  only: string[];
  ignore: string[];
}

export interface BundleRunRequest {
  expectedRevision: number;
  platform: string;
  ignoreMissing: boolean;
}

export interface SimulatorRunRequest extends SimOptions {
  expectedRevision: number;
}

export type ToolRun =
  | (ToolRunBase & { tool: "linter"; request: LinterRunRequest })
  | (ToolRunBase & { tool: "bundle"; request: BundleRunRequest })
  | (ToolRunBase & { tool: "simulator"; request: SimulatorRunRequest });

export type BuildToolName = "linter" | "bundler" | "simulator" | "all";

export interface ToolBuildEntry {
  tool: "linter" | "bundler" | "simulator";
  ok: boolean;
  exitCode: number;
  raw: RawOutput;
}

export interface ToolBuildResult {
  ok: boolean;
  results: ToolBuildEntry[];
  error?: string;
}

export type ToolSource = "config" | "path" | "cargo" | "bundle";

export interface ToolInfo {
  available: boolean;
  version: string | null;
  source: ToolSource | null;
  error?: string;
}

export interface ToolDiscovery {
  linter: ToolInfo;
  bundler: ToolInfo;
  simulator: ToolInfo;
  scout: ToolInfo;
  buildEnabled: boolean;
  updatedAt: string | null;
}

export type ScoutCategory =
  | "node"
  | "chapter"
  | "item"
  | "character"
  | "flag"
  | "event"
  | "texture"
  | "music"
  | "sfx";

export interface ScoutHit {
  category: ScoutCategory;
  id: string;
  label: string;
  chapter?: string;
  scenario: string;
  score: number;
  snippet?: string;
  focus: { route: string; params: Record<string, string> };
}

export interface ScoutOutput {
  kind: "scout";
  query: string;
  target: string;
  count: number;
  results: ScoutHit[];
}

export async function searchProject(
  projectId: string,
  query: string,
  options: {
    only?: ScoutCategory[];
    limit?: number;
    fullText?: boolean;
    signal?: AbortSignal;
  } = {},
): Promise<ScoutHit[]> {
  const url = projectScoutUrl(projectId, {
    query,
    only: options.only ?? [],
    limit: options.limit ?? 30,
    fullText: options.fullText ?? false,
  });
  const res = await fetch(url, { signal: options.signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { parsed: ScoutOutput | null };
  return data.parsed?.results ?? [];
}

export interface LintCategoryMeta {
  id: string;
  rules: string[];
}

export const LINT_CATEGORIES: LintCategoryMeta[] = [
  { id: "format", rules: ["wire-envelopes"] },
  {
    id: "characters",
    rules: [
      "unknown-speaker",
      "unknown-character-ref",
      "unknown-text-relationship",
      "unknown-actor",
      "undeclared-relationship-metric",
    ],
  },
  { id: "catalog", rules: ["flag-not-in-catalog"] },
  { id: "library", rules: ["library-refs"] },
  { id: "engine", rules: ["engine-validation"] },
  {
    id: "navigation",
    rules: ["reachability", "dead-ends", "death-node-coverage"],
  },
  { id: "items", rules: ["items"] },
  { id: "assets", rules: ["assets", "cook"] },
  { id: "references", rules: ["references"] },
];

export interface LintOptions {
  only: string[];
  ignore: string[];
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    const message =
      typeof data === "object" && data
        ? ((data as { message?: string; error?: string }).message ??
          (data as { error?: string }).error)
        : null;
    throw new Error(message ?? `HTTP ${response.status}`);
  }
  return data;
}

export async function discoverTools(projectId: string): Promise<ToolDiscovery> {
  const res = await fetch(projectApiUrl(projectId, ProjectRoutes.ToolsDiscover));
  return res.json() as Promise<ToolDiscovery>;
}

export async function runLinter(
  projectId: string,
  expectedRevision: number,
  options: LintOptions = { only: [], ignore: [] },
): Promise<ToolRun> {
  const response = await postJson<{ run: ToolRun }>(projectToolsRunUrl(projectId, "linter"), {
    expectedRevision,
    only: options.only,
    ignore: options.ignore,
  });
  return response.run;
}

export async function getToolRun(projectId: string, tool: ToolRunName): Promise<ToolRun | null> {
  const response = await fetch(projectToolsRunUrl(projectId, tool));
  const data = (await response.json()) as { run: ToolRun | null; message?: string };
  if (!response.ok) throw new Error(data.message ?? `HTTP ${response.status}`);
  return data.run;
}

export async function runBundlerInspect(
  projectId: string,
  expectedRevision: number,
  platform: string,
  ignoreMissing = false,
): Promise<ToolRun> {
  const response = await postJson<{ run: ToolRun }>(projectToolsRunUrl(projectId, "bundle"), {
    expectedRevision,
    platform,
    ignoreMissing,
  });
  return response.run;
}

export async function runSimulator(
  projectId: string,
  expectedRevision: number,
  options: SimOptions,
): Promise<ToolRun> {
  const response = await postJson<{ run: ToolRun }>(projectToolsRunUrl(projectId, "simulator"), {
    expectedRevision,
    mode: options.mode,
    goals: options.goals,
    goalBudget: options.goalBudget,
    maxStates: options.maxStates,
    threads: options.threads,
    heuristic: options.heuristic,
    check: options.check,
    verbose: options.verbose,
    analytics: options.analytics,
    storeAnalytics: options.storeAnalytics,
  });
  return response.run;
}

export async function buildTool(projectId: string, tool: BuildToolName): Promise<ToolBuildResult> {
  return postJson<ToolBuildResult>(projectApiUrl(projectId, ProjectRoutes.ToolsBuild), { tool });
}
