import path from "node:path";
import { repoRootFrom } from "./paths.mjs";

export function createBuildContext(importMetaUrl, options = {}) {
  const root = repoRootFrom(importMetaUrl, 1);
  const crate = options.crate ?? process.env.CRATE ?? "blackbox";
  const profile = options.profile ?? process.env.PROFILE ?? "release";
  const cargoTargetDir = process.env.CARGO_TARGET_DIR ?? path.join(root, ".cache", "target");

  if (!process.env.CARGO_TARGET_DIR) {
    process.env.CARGO_TARGET_DIR = cargoTargetDir;
  }

  return {
    root,
    crate,
    profile,
    cargoTargetDir,
    artifactDir(target) {
      return path.join(cargoTargetDir, target, profile);
    },
    distDir(platform) {
      return path.join(root, "dist", platform);
    },
    buildInfoFields(target) {
      return { crate, target, profile };
    },
  };
}
