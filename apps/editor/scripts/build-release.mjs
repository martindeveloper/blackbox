#!/usr/bin/env node

import { chmodSync, copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureRust, ensureTarget, resolveCargoTargetDir } from "../../../scripts/lib/cargo.mjs";
import { commandExists, runSync } from "../../../scripts/lib/spawn.mjs";

const editorRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.resolve(editorRoot, "../..");
const resourcesBinDir = path.join(editorRoot, "resources", "bin");
const cargoTargetDir = resolveCargoTargetDir(repoRoot);
const tools = ["blackbox-lint", "blackbox-bundler", "blackbox-simulator"];

const platformArchitectures = {
  macos: {
    defaultArch: "arm64",
    architectures: {
      x64: {
        rustTarget: "x86_64-apple-darwin",
        electronArgs: ["--mac", "--x64"],
      },
      arm64: {
        rustTarget: "aarch64-apple-darwin",
        electronArgs: ["--mac", "--arm64"],
      },
    },
  },
  linux: {
    defaultArch: "x64",
    architectures: {
      x64: {
        rustTarget: "x86_64-unknown-linux-gnu",
        zigTarget: "x86_64-linux-gnu",
        electronArgs: ["--linux", "--x64"],
      },
      arm64: {
        rustTarget: "aarch64-unknown-linux-gnu",
        zigTarget: "aarch64-linux-gnu",
        electronArgs: ["--linux", "--arm64"],
      },
    },
  },
  windows: {
    defaultArch: "x64",
    architectures: {
      x64: {
        rustTarget: "x86_64-pc-windows-msvc",
        cargoSubcommand: "xwin",
        electronArgs: ["--win", "--x64"],
      },
      arm64: {
        rustTarget: "aarch64-pc-windows-msvc",
        cargoSubcommand: "xwin",
        electronArgs: ["--win", "--arm64"],
      },
    },
  },
};

function usage() {
  console.log(`Build release editor packages with matching Rust engine tools.

Usage:
  node ./scripts/build-release.mjs [--platform <all|macos|linux|windows>] [--arch <x64|arm64>]

Examples:
  npm run electron:release
  npm run electron:release -- --platform linux
  npm run electron:release -- --platform windows --arch arm64
`);
}

function parseOptions(args) {
  let platform = "all";
  let arch = null;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
    if (arg === "--platform" || arg === "-p") {
      platform = args[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (arg.startsWith("--platform=")) {
      platform = arg.slice("--platform=".length);
      continue;
    }
    if (arg === "--arch" || arg === "-a") {
      arch = args[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (arg.startsWith("--arch=")) {
      arch = arg.slice("--arch=".length);
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }

  const platformAliases = { mac: "macos", darwin: "macos", win: "windows", win32: "windows" };
  const archAliases = { amd64: "x64", x86_64: "x64", aarch64: "arm64" };
  platform = platformAliases[platform] ?? platform;
  arch = archAliases[arch] ?? arch;
  if (platform !== "all" && !(platform in platformArchitectures)) {
    throw new Error(`unsupported platform "${platform}"`);
  }
  if (arch !== null && arch !== "x64" && arch !== "arm64") {
    throw new Error(`unsupported architecture "${arch}"`);
  }
  return { platform, arch };
}

function createZigWrapper(zigTarget, compiler) {
  const wrapperDir = path.join(repoRoot, ".cache", "editor-cross");
  mkdirSync(wrapperDir, { recursive: true });

  const wrapper = path.join(wrapperDir, `zig-${compiler}-${zigTarget}.mjs`);
  writeFileSync(
    wrapper,
    `#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2).filter((arg) => !arg.startsWith("--target="));
const result = spawnSync("zig", [${JSON.stringify(compiler)}, "-target", ${JSON.stringify(zigTarget)}, ...args], {
  stdio: "inherit",
});
if (result.error) {
  console.error(result.error.message);
}
process.exit(result.status ?? 1);
`,
  );
  chmodSync(wrapper, 0o755);
  return wrapper;
}

function cargoEnvironment(config) {
  const env = { ...process.env, CARGO_TARGET_DIR: cargoTargetDir };
  if (!config.zigTarget) {
    return env;
  }

  if (!commandExists("zig")) {
    throw new Error(
      "Zig is required for Linux cross-compilation; install it from https://ziglang.org/download/",
    );
  }

  const targetKey = config.rustTarget.toUpperCase().replaceAll("-", "_");
  const linker = createZigWrapper(config.zigTarget, "cc");
  const cxx = createZigWrapper(config.zigTarget, "c++");
  env[`CARGO_TARGET_${targetKey}_LINKER`] = linker;
  env[`CC_${config.rustTarget.replaceAll("-", "_")}`] = linker;
  env[`CXX_${config.rustTarget.replaceAll("-", "_")}`] = cxx;
  env[`AR_${config.rustTarget.replaceAll("-", "_")}`] = "zig ar";
  return env;
}

function buildTools(platform, config) {
  console.log(`\n==> building engine tools for ${platform} (${config.rustTarget})`);
  ensureTarget(config.rustTarget);
  if (config.cargoSubcommand === "xwin" && !commandExists("cargo-xwin")) {
    throw new Error(
      "cargo-xwin is required for Windows cross-compilation; run: cargo install --locked cargo-xwin",
    );
  }
  runSync(
    "cargo",
    [
      ...(config.cargoSubcommand ? [config.cargoSubcommand] : []),
      "build",
      "--release",
      "--locked",
      "--target",
      config.rustTarget,
      "-p",
      "blackbox-lint",
      "-p",
      "blackbox-bundler",
      "-p",
      "blackbox-simulator",
    ],
    { cwd: repoRoot, env: cargoEnvironment(config) },
  );
}

function stageTools(config) {
  mkdirSync(resourcesBinDir, { recursive: true });
  for (const tool of tools) {
    rmSync(path.join(resourcesBinDir, tool), { force: true });
    rmSync(path.join(resourcesBinDir, `${tool}.exe`), { force: true });
  }

  const extension = config.rustTarget.includes("windows") ? ".exe" : "";
  const artifactDir = path.join(cargoTargetDir, config.rustTarget, "release");
  for (const tool of tools) {
    const fileName = `${tool}${extension}`;
    const source = path.join(artifactDir, fileName);
    if (!existsSync(source)) {
      throw new Error(`engine tool not found after build: ${source}`);
    }
    const destination = path.join(resourcesBinDir, fileName);
    copyFileSync(source, destination);
    if (!extension) {
      chmodSync(destination, 0o755);
    }
    console.log(`  staged ${fileName}`);
  }
}

function packageEditor(platform, config) {
  console.log(`==> packaging editor for ${platform}`);
  runSync(
    "npm",
    ["exec", "--", "electron-builder", "--config", "electron-builder.yml", ...config.electronArgs],
    { cwd: editorRoot },
  );
}

let options;
try {
  options = parseOptions(process.argv.slice(2));
} catch (error) {
  console.error(`error: ${error.message}`);
  usage();
  process.exit(1);
}

if (process.platform !== "darwin" && (options.platform === "all" || options.platform === "macos")) {
  console.error("error: macOS packages require a macOS host with Xcode Command Line Tools");
  process.exit(1);
}

ensureRust();
if (!commandExists("rustup")) {
  console.error("error: rustup is required to install cross-compilation targets");
  process.exit(1);
}

console.log(`==> building editor web assets on ${os.platform()}/${os.arch()}`);
runSync("npm", ["run", "build"], { cwd: editorRoot });

const selectedPlatforms =
  options.platform === "all"
    ? Object.entries(platformArchitectures)
    : [[options.platform, platformArchitectures[options.platform]]];

for (const [platform, platformConfig] of selectedPlatforms) {
  const arch = options.arch ?? platformConfig.defaultArch;
  const config = platformConfig.architectures[arch];
  console.log(`\n==> selected ${platform}/${arch}`);
  buildTools(platform, config);
  stageTools(config);
  packageEditor(platform, config);
}

console.log(`\n==> editor release packages are ready under ${path.join(editorRoot, "release")}`);
