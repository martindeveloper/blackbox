import { create } from "zustand";
import type { ToolRunState } from "@/hooks/useToolRunner.js";
import type { ToolId } from "@/lib/routeHelpers.js";
import type { ToolDiscovery, ToolInfo } from "@/lib/toolsApi.js";

interface ToolRunnerStore {
  activeTool: ToolId | null;
  runState: ToolRunState;
  discovery: ToolDiscovery | null;
  setToolRunState: (tool: ToolId | null, state: ToolRunState) => void;
  setDiscovery: (discovery: ToolDiscovery) => void;
}

export const useToolRunnerStore = create<ToolRunnerStore>((set) => ({
  activeTool: null,
  runState: "idle",
  discovery: null,
  setToolRunState: (activeTool, runState) => set({ activeTool, runState }),
  setDiscovery: (discovery) => set({ discovery }),
}));

export function toolDiscoveryInfo(
  discovery: ToolDiscovery | null,
  toolId: ToolId,
): ToolInfo | null {
  if (!discovery) return null;
  if (toolId === "linter") return discovery.linter;
  if (toolId === "bundle") return discovery.bundler;
  return discovery.simulator;
}
