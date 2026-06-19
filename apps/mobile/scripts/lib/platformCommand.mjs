import { resolveBuildConfiguration } from "../../../../scripts/lib/adventure.mjs";
import {
  executePlatformCommand,
  executeStage,
} from "../../../../scripts/cli/pipeline.mjs";

function projectArgument(argv) {
  const index = argv.indexOf("--adventure");
  const value = index >= 0 ? argv[index + 1] : process.env.BLACKBOX_ADVENTURE;
  if (!value) {
    throw new Error("set BLACKBOX_ADVENTURE or pass --adventure <path>");
  }
  return value;
}

export async function runMobileCommand(platform, argv = process.argv.slice(2)) {
  const command = argv[0];
  const project = projectArgument(argv);
  const configuration = resolveBuildConfiguration(process.env);

  if (command === "sync" || command === "run") {
    await executeStage({
      stage: "build",
      project,
      platform,
      configuration,
      options: {
        configuration,
        noBuild: argv.includes("--no-build"),
      },
    });
    if (command === "run") {
      await executePlatformCommand({ command: "run", project, platform, configuration });
    }
    return;
  }

  if (command === "open") {
    await executePlatformCommand({ command: "open", project, platform, configuration });
    return;
  }

  throw new Error(`unknown command "${command ?? ""}" — expected sync, open, or run`);
}
