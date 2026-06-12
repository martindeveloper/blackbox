import { useScenarioStore } from "../store/useScenarioStore.js";

export async function tryRestoreProject(projectId: string): Promise<boolean> {
  const state = useScenarioStore.getState();
  if (state.projectId === projectId && state.bundle) return true;
  return state.openProject(projectId);
}
