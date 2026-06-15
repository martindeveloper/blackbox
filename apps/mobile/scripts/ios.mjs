#!/usr/bin/env node
/**
 * Drive the per-adventure iOS build in <adventure>/.blackbox/build.
 *
 *   node scripts/ios.mjs <sync|open|run> [--no-build] [--adventure <path>]
 *
 * `sync` / `run` assemble the payload, scaffold the disposable Capacitor
 * workspace, then add-or-sync the iOS project (re-applying native overrides).
 * `open` just opens Xcode on the already-generated project.
 */
import {
  resolveAdventure,
  buildPayload,
  ensureWorkspace,
  capSyncIos,
  capOpenIos,
  capRunIos,
} from "./lib/workspace.mjs";

const argv = process.argv.slice(2);
const cmd = argv[0];
const noBuild = argv.includes("--no-build");
const adv = resolveAdventure(argv);

switch (cmd) {
  case "sync":
  case "run": {
    buildPayload(adv, { noBuild, platform: "ios" });
    ensureWorkspace(adv);
    await capSyncIos(adv);
    if (cmd === "run") capRunIos(adv);
    break;
  }
  case "open": {
    ensureWorkspace(adv);
    capOpenIos(adv);
    break;
  }
  default:
    console.error(`[mobile] unknown command: ${cmd ?? "(none)"} — use sync | open | run`);
    process.exit(1);
}
