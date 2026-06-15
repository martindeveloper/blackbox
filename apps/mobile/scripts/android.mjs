#!/usr/bin/env node
/**
 * Drive the per-adventure Android build in <adventure>/.blackbox/build.
 *
 *   node scripts/android.mjs <sync|open|run> [--no-build] [--adventure <path>]
 */
import {
  resolveAdventure,
  buildPayload,
  ensureWorkspace,
  capOpenAndroid,
  capSyncAndroid,
  capRunAndroid,
} from "./lib/workspace.mjs";

const argv = process.argv.slice(2);
const cmd = argv[0];
const noBuild = argv.includes("--no-build");
const adv = resolveAdventure(argv);

switch (cmd) {
  case "sync":
  case "run": {
    buildPayload(adv, { noBuild, platform: "android" });
    ensureWorkspace(adv, "android");
    await capSyncAndroid(adv);
    if (cmd === "run") capRunAndroid(adv);
    break;
  }
  case "open": {
    ensureWorkspace(adv, "android");
    capOpenAndroid(adv);
    break;
  }
  default:
    console.error(`[mobile] unknown command: ${cmd ?? "(none)"} — use sync | open | run`);
    process.exit(1);
}
