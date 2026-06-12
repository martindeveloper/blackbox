import { readFileSync } from "node:fs";
import path from "node:path";
import { capture, commandExists, runSync } from "./spawn.mjs";

export function resolveCargoTargetDir(repoRoot, env = process.env) {
  if (env.CARGO_TARGET_DIR) {
    const envDir = env.CARGO_TARGET_DIR;
    return path.isAbsolute(envDir) ? path.resolve(envDir) : path.join(repoRoot, envDir);
  }

  try {
    const configPath = path.join(repoRoot, ".cargo", "config.toml");
    const text = readFileSync(configPath, "utf8");
    const match = /^\s*target-dir\s*=\s*"([^"]+)"/m.exec(text);
    if (match?.[1]) {
      const configured = match[1].trim();
      return path.isAbsolute(configured)
        ? path.resolve(configured)
        : path.join(repoRoot, configured);
    }
  } catch {
    // .cargo/config.toml is optional
  }

  return path.join(repoRoot, ".cache", "target");
}

export function ensureRust() {
  if (!commandExists("cargo")) {
    console.error("error: cargo not found; install Rust from https://rustup.rs");
    process.exit(1);
  }
}

export function ensureTarget(target) {
  const installed = capture("rustup", ["target", "list", "--installed"])
    .split("\n")
    .map((line) => line.trim());
  if (!installed.includes(target)) {
    console.log(`==> installing Rust target: ${target}`);
    runSync("rustup", ["target", "add", target]);
  }
}

export function buildCrate(ctx, target, extraArgs = [], { env = process.env } = {}) {
  console.log(`==> building ${ctx.crate} (${target}, ${ctx.profile})`);
  runSync(
    "cargo",
    [
      "build",
      "--manifest-path",
      `${ctx.root}/Cargo.toml`,
      "-p",
      ctx.crate,
      "--profile",
      ctx.profile,
      "--target",
      target,
      ...extraArgs,
    ],
    { cwd: ctx.root, env },
  );
}
