import { useMemo } from "react";
import { useScenarioStore } from "@/store/useScenarioStore.js";
import type { RootFileEntry } from "@/lib/projectApi.js";

export function useProjectRootFiles(ext = ".json"): RootFileEntry[] {
  const rootFiles = useScenarioStore((state) => state.rootFiles);
  return useMemo(
    () => rootFiles.filter((file) => file.name.toLowerCase().endsWith(ext)),
    [rootFiles, ext],
  );
}
