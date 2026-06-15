import fs from "node:fs/promises";
import path from "node:path";
import { runProcess, runCargo, platformBin } from "../cargo.js";
import { appendOutput, commandResult, parseBundle } from "../parsers.js";

/** Run blackbox-bundler for a registered player id (`--platform` value). */
export async function runPlayerBundle({
  platform,
  projectPath,
  tools,
  workDir,
  bundleCache,
  ignoreMissing = false,
}) {
  const bundleWorkDir = path.join(workDir, ".cache");
  await fs.mkdir(bundleWorkDir, { recursive: true });
  await fs.mkdir(bundleCache, { recursive: true });
  const outputDir = await fs.mkdtemp(path.join(bundleWorkDir, "editor-bundle-"));
  try {
    const args = [
      path.join(projectPath, "scenario.json"),
      "--platform",
      platform,
      "-o",
      outputDir,
      "--cache-dir",
      bundleCache,
      "--json",
    ];
    if (ignoreMissing) args.push("--ignore-missing");
    const bundle = tools.bundler
      ? await runProcess(platformBin(tools.bundler), args, workDir)
      : await runCargo("blackbox-bundler", args, { release: true });
    const stdout = [];
    const stderr = [];
    appendOutput(stdout, "bundle", bundle);
    if (bundle.stderr) stderr.push(bundle.stderr);
    let inspect = { exitCode: bundle.exitCode, stdout: "", stderr: "" };
    if (bundle.exitCode === 0) {
      const inspectArgs = ["inspect", outputDir, "--json"];
      inspect = tools.bundler
        ? await runProcess(platformBin(tools.bundler), inspectArgs, workDir)
        : await runCargo("blackbox-bundler", inspectArgs, { release: true });
      appendOutput(stdout, "inspect", inspect);
      if (inspect.stderr) stderr.push(inspect.stderr);
    }
    const exitCode = bundle.exitCode || inspect.exitCode;
    return {
      ok: exitCode === 0,
      exitCode,
      raw: { stdout: stdout.join(""), stderr: stderr.join("") },
      phases: { bundle: commandResult(bundle), inspect: commandResult(inspect) },
      parsed: parseBundle(bundle.stdout, inspect.stdout, bundle.stderr),
    };
  } finally {
    await fs.rm(outputDir, { recursive: true, force: true });
  }
}
