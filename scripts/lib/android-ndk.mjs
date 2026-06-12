import { existsSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

function ndkPrebuiltCandidates() {
  const platform = os.platform();
  const arch = os.arch();

  if (platform === "darwin" && arch === "arm64") {
    return ["darwin-arm64", "darwin-x86_64"];
  }
  if (platform === "darwin" && arch === "x64") {
    return ["darwin-x86_64"];
  }
  if (platform === "linux" && arch === "x64") {
    return ["linux-x86_64"];
  }
  if (platform === "win32") {
    return ["windows-x86_64"];
  }

  console.error(`error: unsupported host for Android NDK: ${platform}/${arch}`);
  process.exit(1);
}

export function ndkPrebuiltHost(ndkRoot) {
  const prebuiltRoot = path.join(ndkRoot, "toolchains", "llvm", "prebuilt");
  for (const candidate of ndkPrebuiltCandidates()) {
    const dir = path.join(prebuiltRoot, candidate);
    if (existsSync(dir)) {
      return candidate;
    }
  }
  console.error(
    `error: no supported NDK prebuilt toolchain found under ${prebuiltRoot}`,
  );
  process.exit(1);
}

function compareVersionStrings(a, b) {
  const pa = a.split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
  const pb = b.split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

export function findNdk() {
  const explicit = [process.env.ANDROID_NDK_HOME, process.env.NDK_HOME].filter(Boolean);
  for (const candidate of explicit) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  let sdkHome = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? "";
  if (!sdkHome && process.platform === "darwin") {
    const defaultSdk = path.join(os.homedir(), "Library", "Android", "sdk");
    if (existsSync(defaultSdk)) {
      sdkHome = defaultSdk;
    }
  }
  if (!sdkHome && process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local");
    const defaultSdk = path.join(localAppData, "Android", "Sdk");
    if (existsSync(defaultSdk)) {
      sdkHome = defaultSdk;
    }
  }
  if (!sdkHome && process.platform === "linux") {
    const defaultSdk = path.join(os.homedir(), "Android", "Sdk");
    if (existsSync(defaultSdk)) {
      sdkHome = defaultSdk;
    }
  }

  const ndkDir = sdkHome ? path.join(sdkHome, "ndk") : "";
  if (ndkDir && existsSync(ndkDir)) {
    const versions = readdirSync(ndkDir).sort(compareVersionStrings);
    const latest = versions.at(-1);
    if (latest) {
      return path.join(ndkDir, latest);
    }
  }

  console.error("error: Android NDK not found.");
  console.error("Set ANDROID_NDK_HOME to your NDK root (contains toolchains/llvm/).");
  process.exit(1);
}

export function androidLinker(ndkRoot, apiLevel = process.env.ANDROID_API_LEVEL ?? "24") {
  const prebuilt = ndkPrebuiltHost(ndkRoot);
  const binDir = path.join(ndkRoot, "toolchains", "llvm", "prebuilt", prebuilt, "bin");
  const linker = path.join(binDir, `aarch64-linux-android${apiLevel}-clang${process.platform === "win32" ? ".cmd" : ""}`);
  if (!existsSync(linker)) {
    const fallback = path.join(binDir, `aarch64-linux-android${apiLevel}-clang`);
    if (!existsSync(fallback)) {
      console.error(`error: NDK linker not found: ${linker}`);
      process.exit(1);
    }
    return fallback;
  }
  return linker;
}
