#!/usr/bin/env node
/**
 * Build just the web payload into <adventure>/.blackbox/build/www.
 *
 *   BLACKBOX_ADVENTURE='/abs/path' npm run payload
 *   node scripts/payload.mjs --adventure /abs/path [--no-build] [--platform=ios|android]
 */
import { resolveAdventure, buildPayload, log } from "./lib/workspace.mjs";
import { displayPath } from "../../../scripts/lib/paths.mjs";
import path from "node:path";

const argv = process.argv.slice(2);
const adv = resolveAdventure(argv);
const platform =
  argv.find((arg) => arg.startsWith("--platform="))?.split("=")[1] ??
  process.env.BLACKBOX_PLATFORM ??
  "ios";

buildPayload(adv, { noBuild: argv.includes("--no-build"), platform });
log(`done -> ${displayPath(path.join(adv.buildDir, "www"))}`);
