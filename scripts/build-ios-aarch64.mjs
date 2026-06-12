#!/usr/bin/env node
// Build blackbox as a static library for iOS devices (aarch64).

import path from "node:path";
import { buildCrate, ensureRust, ensureTarget } from "./lib/cargo.mjs";
import { createBuildContext } from "./lib/build-context.mjs";
import { copyIfExists, writeBuildInfo } from "./lib/fs-utils.mjs";
import { spawnSync } from "node:child_process";

const TARGET = "aarch64-apple-ios";
const PLATFORM = "ios-aarch64";

if (process.platform !== "darwin") {
  console.error("error: iOS builds require macOS with Xcode command-line tools");
  process.exit(1);
}

const sdkCheck = spawnSync("xcrun", ["--sdk", "iphoneos", "--show-sdk-path"], {
  stdio: "ignore",
});
if (sdkCheck.status !== 0) {
  console.error("error: iphoneos SDK not found; install Xcode command-line tools");
  process.exit(1);
}

const ctx = createBuildContext(import.meta.url, { crate: "blackbox-ffi" });
const out = ctx.distDir(PLATFORM);

ensureRust();
ensureTarget(TARGET);
buildCrate(ctx, TARGET);

const art = ctx.artifactDir(TARGET);
console.log(`==> copying artifacts to ${out}`);
copyIfExists(path.join(art, "libblackbox_ffi.a"), out);
writeBuildInfo(out, ctx.buildInfoFields(TARGET));

console.log(`==> done: ${out}`);
console.log("    link libblackbox_ffi.a + engine/ffi/include/blackbox.h from apps/ios");
