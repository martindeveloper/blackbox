import { resolvePlatformConfig } from "../../lib/adventure.mjs";

/** Adapt a CLI project record to the mobile workspace `adv` shape. */
export function toMobileAdv(project, platform) {
  return {
    root: project.root,
    scenario: project.scenarioPath,
    gameId: project.gameId,
    title: project.title,
    buildDir: project.buildDir,
    webWwwDir: project.webWwwDir,
    configuration: project.configuration,
    platform: resolvePlatformConfig(project, platform),
  };
}
