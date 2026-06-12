import { useScenarioStore } from "../store/useScenarioStore.js";
import { getMediaUrl } from "../lib/mediaPreview.js";
import { scenarioFsPath } from "../lib/scenarioPaths.js";

export function useMediaPreview(
  projectId: string | null,
  path: string | null | undefined,
  enabled = true,
  pathPrefix = "",
) {
  const revision = useScenarioStore((state) => state.revision);
  const activePath = enabled && path ? scenarioFsPath(pathPrefix, path) : null;
  return {
    url: getMediaUrl(projectId, activePath, revision),
    failed: false,
    loading: false,
  };
}
