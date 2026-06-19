import { runStageLifecycle } from "./lifecycle.mjs";

export function stageLint(platform, project, options = {}) {
  return runStageLifecycle({ stage: "lint", platform, project, options });
}
