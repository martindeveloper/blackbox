import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveBuildConfiguration } from "../../../../scripts/lib/adventure.mjs";
import {
  DEFAULT_WEB_PLAYER_GAME,
  localProjectSrcDir,
  projectHasCustomCode,
  repoGameDataRoot,
  resolveGameSrcDir,
  shellSrcDir,
} from "../../../../scripts/lib/gamePaths.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

function resolveAdventureRoot(raw) {
  let resolved = path.resolve(raw);
  if (!existsSync(resolved)) {
    const fromRepo = path.resolve(REPO_ROOT, raw);
    if (existsSync(fromRepo)) resolved = fromRepo;
  }
  return resolved;
}

/** Read `--adventure <path>` or `--adventure=<path>` from argv (after npm `--`). */
export function adventurePathFromArgv(argv = process.argv.slice(2)) {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--adventure") {
      const value = argv[i + 1];
      if (value && !value.startsWith("-")) return value;
      throw new Error("--adventure requires a path");
    }
    if (arg.startsWith("--adventure=")) {
      const value = arg.slice("--adventure=".length);
      if (value) return value;
      throw new Error("--adventure= requires a path");
    }
  }
  return null;
}

function adventureEnv(env = process.env, argv = process.argv.slice(2)) {
  const fromArg = adventurePathFromArgv(argv);
  return fromArg ? { ...env, BLACKBOX_ADVENTURE: fromArg } : env;
}

/**
 * Resolve local web-player dev target from env:
 * - `BLACKBOX_ADVENTURE` — project root, e.g. `data/silent_archive_game`
 * - `BLACKBOX_SCENARIO` — project root or `scenario.json` path (legacy)
 *
 * UI: `<root>/src/game.ts` when present, otherwise the generic `editor-preview` shell.
 */
export function resolveWebDevAdventure(env = process.env) {
  const raw = env.BLACKBOX_ADVENTURE ?? env.BLACKBOX_SCENARIO;
  if (!raw) return null;

  const resolved = resolveAdventureRoot(raw);
  let adventureRoot;
  let scenarioPath;

  if (path.basename(resolved) === "scenario.json") {
    scenarioPath = resolved;
    adventureRoot = path.dirname(resolved);
  } else if (existsSync(resolved) && statSync(resolved).isDirectory()) {
    adventureRoot = resolved;
    scenarioPath = path.join(resolved, "scenario.json");
  } else {
    throw new Error(`Adventure path not found: ${resolved}`);
  }

  if (!existsSync(scenarioPath)) {
    throw new Error(`Scenario not found: ${scenarioPath}`);
  }

  return {
    adventureRoot,
    scenarioPath,
    gameId: path.basename(adventureRoot),
  };
}

export function resolveWebOutDir(env = process.env) {
  const adventure = resolveWebDevAdventure(env);
  if (!adventure) {
    throw new Error(
      "BLACKBOX_ADVENTURE (or BLACKBOX_SCENARIO) is required — the web build writes " +
        "into <adventure>/.blackbox/build/<configuration>/web, never into the engine repo.",
    );
  }
  const configuration = resolveBuildConfiguration(env);
  return path.join(adventure.adventureRoot, ".blackbox", "build", configuration, "web");
}

export function resolveWebWwwDir(env = process.env) {
  return path.join(resolveWebOutDir(env), "www");
}

/** Custom adventure UI sources from `BLACKBOX_ADVENTURE`, `BLACKBOX_SCENARIO`, or `--adventure`. */
export function resolveAdventureUiSrc(env = process.env, argv = process.argv.slice(2)) {
  const adventure = resolveWebDevAdventure(adventureEnv(env, argv));
  if (!adventure) {
    throw new Error(
      "Set BLACKBOX_ADVENTURE (or BLACKBOX_SCENARIO), or pass --adventure <path>",
    );
  }
  const srcDir = localProjectSrcDir(adventure.adventureRoot);
  if (!projectHasCustomCode(adventure.adventureRoot)) {
    throw new Error(`No custom UI at ${srcDir} — expected game.ts`);
  }
  return { adventure, srcDir };
}

export function resolveWebPlayerGame(env = process.env, webRoot, repoRoot) {
  const adventure = resolveWebDevAdventure(env);

  if (env.BLACKBOX_WEB_PLAYER_GAME) {
    const gameId = env.BLACKBOX_WEB_PLAYER_GAME;
    const gameSrc =
      resolveGameSrcDir(gameId, [repoGameDataRoot(repoRoot)], webRoot) ??
      shellSrcDir(webRoot, gameId);
    return { gameId, gameSrc, adventure };
  }

  if (adventure) {
    const gameSrc = projectHasCustomCode(adventure.adventureRoot)
      ? localProjectSrcDir(adventure.adventureRoot)
      : shellSrcDir(webRoot, DEFAULT_WEB_PLAYER_GAME);
    return { gameId: adventure.gameId, gameSrc, adventure };
  }

  return {
    gameId: DEFAULT_WEB_PLAYER_GAME,
    gameSrc: shellSrcDir(webRoot, DEFAULT_WEB_PLAYER_GAME),
    adventure: null,
  };
}
