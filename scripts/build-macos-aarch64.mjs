#!/usr/bin/env node
// Build blackbox as a macOS Apple Silicon static + dynamic library.

import path from "node:path";
import { buildCrate, ensureRust, ensureTarget } from "./lib/cargo.mjs";
import { createBuildContext } from "./lib/build-context.mjs";
import { copyIfExists, writeBuildInfo } from "./lib/fs-utils.mjs";

const TARGET = "aarch64-apple-darwin";
const PLATFORM = "macos-aarch64";

if (process.platform !== "darwin") {
  console.error("error: macOS library builds require a Mac host");
  process.exit(1);
}

const ctx = createBuildContext(import.meta.url);
const out = ctx.distDir(PLATFORM);

ensureRust();
ensureTarget(TARGET);
buildCrate(ctx, TARGET);

const art = ctx.artifactDir(TARGET);
console.log(`==> copying artifacts to ${out}`);
copyIfExists(path.join(art, "libblackbox.a"), out);
copyIfExists(path.join(art, "libblackbox.dylib"), out);
writeBuildInfo(out, ctx.buildInfoFields(TARGET));

console.log(`==> done: ${out}`);
