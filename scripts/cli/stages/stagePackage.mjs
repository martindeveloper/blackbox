import { requireStageReady } from "../../lib/preflight/index.mjs";
import { stageBuild } from "./stageBuild.mjs";
import { stageBundle } from "./stageBundle.mjs";
import { runStageLifecycle } from "./lifecycle.mjs";

export async function stagePackage(platform, project, options = {}) {
  if (!options.skipPreflight) {
    await requireStageReady(platform.name, "package", project);
  }

  const hasBuildInput = Boolean(options.buildInput);
  const hasBundleInput = Boolean(options.bundleInput);
  if (hasBuildInput !== hasBundleInput) {
    throw new Error("Package requires both buildInput and bundleInput, or neither");
  }

  let lifecycleOptions = options;
  // Standalone Package is self-contained. Pipeline Package receives both explicit
  // artifacts from earlier stages and skips composition.
  if (!hasBuildInput) {
    const bundleInput = await stageBundle(platform, project, {
      ...options,
      skipPreflight: options.skipPreflight,
    });
    const buildInput = await stageBuild(platform, project, {
      ...options,
      bundleInput,
      skipPreflight: options.skipPreflight,
    });
    lifecycleOptions = { ...options, bundleInput, buildInput };
  }
  return runStageLifecycle({
    stage: "package",
    platform,
    project,
    options: { ...lifecycleOptions, skipPreflight: true },
  });
}
