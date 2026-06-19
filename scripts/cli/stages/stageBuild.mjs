import { runStageLifecycle } from "./lifecycle.mjs";

export function stageBuild(platform, project, options = {}) {
  return runStageLifecycle({ stage: "build", platform, project, options });
}
