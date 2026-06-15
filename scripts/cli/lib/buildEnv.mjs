import { resolveBuildConfiguration } from "../../lib/adventure.mjs";

export function playerBuildEnv(
  project,
  configuration = project.configuration ?? "release",
  platform = "web",
) {
  return {
    ...process.env,
    BLACKBOX_ADVENTURE: project.root,
    BLACKBOX_CONFIGURATION: configuration,
    BLACKBOX_PLATFORM: platform,
    BUNDLE_PLATFORM: platform,
  };
}

export function configurationFromProject(project, override) {
  return override ?? project.configuration ?? resolveBuildConfiguration(process.env);
}
