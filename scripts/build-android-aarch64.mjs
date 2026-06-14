#!/usr/bin/env node
// Build blackbox as a shared library for Android arm64-v8a.

import path from "node:path";
import { androidLinker, findNdk } from "./android-ndk.mjs";
import { buildCrate, ensureRust, ensureTarget } from "./lib/cargo.mjs";
import { createBuildContext } from "./lib/build-context.mjs";
import { copyIfExists, writeBuildInfo } from "./lib/fs-utils.mjs";

const TARGET = "aarch64-linux-android";
const PLATFORM = "android-aarch64";

const ndk = findNdk();
const linker = androidLinker(ndk);
const env = {
  ...process.env,
  CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER: linker,
  CARGO_TARGET_AARCH64_LINUX_ANDROID_RUSTFLAGS: "-C link-arg=-fPIC",
};

const ctx = createBuildContext(import.meta.url, { crate: "blackbox-ffi" });
const out = ctx.distDir(PLATFORM);

ensureRust();
ensureTarget(TARGET);
buildCrate(ctx, TARGET, [], { env });

const art = ctx.artifactDir(TARGET);
console.log(`==> copying artifacts to ${out}`);
copyIfExists(path.join(art, "libblackbox_ffi.so"), out);
writeBuildInfo(out, ctx.buildInfoFields(TARGET));

console.log(`==> done: ${out}`);
console.log("    JNI / Kotlin: load libblackbox_ffi.so from apps/android (arm64-v8a)");
