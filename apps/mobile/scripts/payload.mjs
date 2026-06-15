#!/usr/bin/env node
/**
 * Build just the web payload into <adventure>/.blackbox/build/www.
 *
 *   BLACKBOX_ADVENTURE='/abs/path' npm run payload
 *   node scripts/payload.mjs --adventure /abs/path [--no-build] [--platform=ios|android]
 */
import { resolveAdventure, buildPayload, log, REPO_ROOT } from "./lib/workspace.mjs";
import path from "node:path";

const argv = process.argv.slice(2);
const adv = resolveAdventure(argv);
const platform =
  argv.find((arg) => arg.startsWith("--platform="))?.split("=")[1] ??
  process.env.BLACKBOX_PLATFORM ??
  "ios";

buildPayload(adv, { noBuild: argv.includes("--no-build"), platform });
log(`done -> ${path.relative(REPO_ROOT, path.join(adv.buildDir, "www"))}`);
