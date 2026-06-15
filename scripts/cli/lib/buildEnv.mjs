import { resolveBuildConfiguration } from "../../lib/adventure.mjs";

export function playerBuildEnv(project, configuration = project.configuration ?? "release") {
  return {
    ...process.env,
    BLACKBOX_ADVENTURE: project.root,
    BLACKBOX_CONFIGURATION: configuration,
  };
}

export function configurationFromProject(project, override) {
  return override ?? project.configuration ?? resolveBuildConfiguration(process.env);
}
