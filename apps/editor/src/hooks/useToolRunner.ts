import { useCallback, useEffect, useRef, useState } from "react";
import { getDefaultBundlePlayerId } from "../lib/playersApi.js";
import {
  getToolRun,
  runBundlerInspect,
  runLinter,
  runSimulator,
  DEFAULT_SIM_OPTIONS,
  type BundleToolResult,
  type LintOptions,
  type SimOptions,
  type ToolRun,
  type ToolResult,
} from "../lib/toolsApi.js";
import type { ToolId } from "../lib/routeHelpers.js";
import { useScenarioStore } from "../store/useScenarioStore.js";

export type ToolRunState = "idle" | "running" | "done" | "error";

export function useToolRunner(
  toolId: ToolId,
  ignoreMissing = false,
  lintOptions?: LintOptions,
  simOptions?: SimOptions,
) {
  const projectId = useScenarioStore((state) => state.projectId);
  const projectName = useScenarioStore((state) => state.projectName);
  const conflict = useScenarioStore((state) => state.conflict);
  const [runState, setRunState] = useState<ToolRunState>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [result, setResult] = useState<ToolResult | BundleToolResult | null>(null);
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  const [toolRun, setToolRun] = useState<ToolRun | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const latestStartedAt = useRef(0);

  const applyRun = useCallback((toolRun: ToolRun | null) => {
    setConfigError(null);
    if (!toolRun) {
      setRunState("idle");
      setElapsedMs(0);
      setResult(null);
      setRunStartedAt(null);
      setToolRun(null);
      return;
    }
    if (toolRun.startedAt < latestStartedAt.current) return;
    latestStartedAt.current = toolRun.startedAt;
    setRunState(toolRun.state);
    setResult(toolRun.result);
    setToolRun(toolRun);
    if (toolRun.state === "running") {
      setRunStartedAt(toolRun.startedAt);
      setElapsedMs(Date.now() - toolRun.startedAt);
    } else {
      setRunStartedAt(null);
      setElapsedMs(Math.max(0, (toolRun.completedAt ?? Date.now()) - toolRun.startedAt));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    latestStartedAt.current = 0;
    setHydrated(false);
    setConfigError(null);
    setRunState("idle");
    setElapsedMs(0);
    setResult(null);
    setRunStartedAt(null);
    setToolRun(null);
    if (!projectId) {
      setHydrated(true);
      return;
    }

    void getToolRun(projectId, toolId)
      .then((toolRun) => {
        if (!cancelled) applyRun(toolRun);
      })
      .catch((error) => {
        if (!cancelled) {
          setConfigError(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });

    return () => {
      cancelled = true;
    };
  }, [applyRun, projectId, toolId]);

  useEffect(() => {
    if (!projectId || !hydrated || runState !== "running") return;
    let cancelled = false;
    const poll = async () => {
      try {
        const toolRun = await getToolRun(projectId, toolId);
        if (!cancelled) applyRun(toolRun);
      } catch {
      }
    };
    const id = window.setInterval(() => void poll(), 500);
    void poll();
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [applyRun, hydrated, projectId, runState, toolId]);

  useEffect(() => {
    if (runState !== "running" || runStartedAt === null) return;
    const tick = () => setElapsedMs(Date.now() - runStartedAt);
    tick();
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
  }, [runState, runStartedAt]);

  const canRun = Boolean(projectId) && hydrated && !conflict;

  const run = useCallback(async () => {
    if (!projectId || runState === "running" || conflict) return;
    setConfigError(null);
    setRunState("running");
    setResult(null);
    setToolRun(null);
    setElapsedMs(0);
    const startedAt = Date.now();
    latestStartedAt.current = startedAt;
    setRunStartedAt(startedAt);

    try {
      const saved = await useScenarioStore.getState().save();
      if (!saved) throw new Error("Save or resolve the project conflict before running tools");
      const revision = useScenarioStore.getState().revision;
      if (revision === null) throw new Error("Project revision is unavailable");
      const toolRun =
        toolId === "linter"
          ? await runLinter(projectId, revision, lintOptions)
          : toolId === "simulator"
            ? await runSimulator(projectId, revision, simOptions ?? DEFAULT_SIM_OPTIONS)
            : await runBundlerInspect(
                projectId,
                revision,
                await getDefaultBundlePlayerId(),
                ignoreMissing,
              );
      applyRun(toolRun);
    } catch (error) {
      setResult({
        ok: false,
        exitCode: -1,
        raw: { stdout: "", stderr: "" },
        parsed: null,
        error: error instanceof Error ? error.message : String(error),
      });
      setRunState("error");
      setElapsedMs(Date.now() - startedAt);
      setRunStartedAt(null);
    }
  }, [applyRun, projectId, runState, conflict, toolId, ignoreMissing, lintOptions, simOptions]);

  return {
    projectName,
    runState,
    elapsedMs,
    result,
    toolRun,
    configError,
    canRun,
    configReady: Boolean(projectId) && hydrated,
    run,
  };
}
