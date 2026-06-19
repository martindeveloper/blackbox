import { requireStageReady } from "../../lib/preflight/index.mjs";

function hookName(prefix, stage) {
  return `${prefix}${stage[0].toUpperCase()}${stage.slice(1)}`;
}

/**
 * Execute one stage through the common lifecycle:
 * preflightCheck -> before<Stage> -> execute<Stage> -> after<Stage>.
 *
 * Hooks receive the same mutable context. `execute` may return an artifact;
 * `after` may replace it by returning a non-undefined value.
 */
export async function runStageLifecycle({ stage, platform, project, options = {} }) {
  const context = {
    stage,
    platform: platform.name,
    project,
    options,
    artifact: null,
  };

  if (!options.skipPreflight) {
    await requireStageReady(platform.name, stage, project);
  }

  const before = platform[hookName("before", stage)];
  const execute = platform[hookName("execute", stage)];
  const after = platform[hookName("after", stage)];

  if (before) await before(context);
  if (!execute) {
    throw new Error(`platform "${platform.name}" does not implement stage "${stage}"`);
  }

  context.artifact = (await execute(context)) ?? context.artifact;
  if (after) {
    const replacement = await after(context);
    if (replacement !== undefined) context.artifact = replacement;
  }
  return context.artifact;
}
