import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { capture } from "./spawn.mjs";

export function copyIfExists(src, destDir) {
  if (!existsSync(src)) {
    return false;
  }
  mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, path.basename(src));
  copyFileSync(src, dest);
  console.log(`    ${dest}`);
  return true;
}

export function writeBuildInfo(destDir, { crate, target, profile }) {
  mkdirSync(destDir, { recursive: true });
  const builtAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  let rustc = "unknown";
  try {
    rustc = capture("rustc", ["--version"]).trim();
  } catch {
    // rustc may be unavailable in some environments
  }
  const info = `crate=${crate}\ntarget=${target}\nprofile=${profile}\nbuilt_at=${builtAt}\nrustc=${rustc}\n`;
  writeFileSync(path.join(destDir, "build-info.txt"), info);
}
