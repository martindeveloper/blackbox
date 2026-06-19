import { stageBuild } from "./stageBuild.mjs";
import { stageBundle } from "./stageBundle.mjs";
import { stageLint } from "./stageLint.mjs";
import { stagePackage } from "./stagePackage.mjs";

export const STAGES = {
  lint: stageLint,
  build: stageBuild,
  bundle: stageBundle,
  package: stagePackage,
};

export const STAGE_NAMES = Object.freeze(Object.keys(STAGES));
