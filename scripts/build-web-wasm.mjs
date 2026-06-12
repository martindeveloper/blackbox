#!/usr/bin/env node
// Build blackbox as a WebAssembly cdylib (pure engine library).

import path from "node:path";
import { buildCrate, ensureRust, ensureTarget } from "./lib/cargo.mjs";
import { createBuildContext } from "./lib/build-context.mjs";
import { copyIfExists, writeBuildInfo } from "./lib/fs-utils.mjs";

const TARGET = "wasm32-unknown-unknown";
const PLATFORM = "web-wasm";

const ctx = createBuildContext(import.meta.url);
const out = ctx.distDir(PLATFORM);

ensureRust();
ensureTarget(TARGET);
buildCrate(ctx, TARGET);

const art = ctx.artifactDir(TARGET);
console.log(`==> copying artifacts to ${out}`);
copyIfExists(path.join(art, "blackbox.wasm"), out);
copyIfExists(path.join(art, "libblackbox.wasm"), out);
writeBuildInfo(out, ctx.buildInfoFields(TARGET));

console.log(`==> done: ${out}`);
