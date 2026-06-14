import { existsSync, statSync } from "node:fs";
import path from "node:path";
import {
  DEFAULT_WEB_PLAYER_GAME,
  localProjectSrcDir,
  projectHasCustomCode,
  repoGameDataRoot,
  resolveGameSrcDir,
  shellSrcDir,
} from "../../../../scripts/lib/gamePaths.mjs";

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

  const resolved = path.resolve(raw);
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
