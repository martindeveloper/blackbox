import { runStageLifecycle } from "./lifecycle.mjs";

export function stageBundle(platform, project, options = {}) {
  return runStageLifecycle({ stage: "bundle", platform, project, options });
}
