import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { repoGameDataRoot } from "./gamePaths.mjs";

function toUrl(filePath) {
  return filePath.replaceAll("\\", "/");
}

/**
 * Compile a game UI Tailwind bundle: engine shell CSS + the UI's `app.css`
 * (`data/<game>/src/app.css` or `apps/web/src/shells/<id>/app.css`).
 * Writes a ephemeral wrapper so paths work in dev (apps/web engine) and packaged
 * preview-workspace layouts alike.
 */
export async function buildGameCss({
  webRoot,
  gameSrc,
  outFile,
  execPath = process.execPath,
  watch = false,
}) {
  const engineRoot = path.join(webRoot, "src", "engine");
  const engineUi = path.join(engineRoot, "ui");
  const gameApp = path.join(gameSrc, "app.css");
  const wrapperDir = path.join(webRoot, ".cache", "preview-tailwind");
  const wrapper = path.join(
    wrapperDir,
    `${gameSrc.endsWith(`${path.sep}src`) ? path.basename(path.dirname(gameSrc)) : path.basename(gameSrc)}.css`,
  );

  const lines = [
    `@import "tailwindcss";`,
    `@source "${toUrl(gameSrc)}";`,
    `@source "${toUrl(engineRoot)}";`,
    `@import "${toUrl(path.join(engineUi, "tokens.css"))}";`,
    `@import "${toUrl(path.join(engineUi, "preloader.css"))}";`,
    `@import "${toUrl(path.join(engineUi, "base.css"))}";`,
    `@import "${toUrl(gameApp)}";`,
  ];
  await fs.mkdir(wrapperDir, { recursive: true });
  await fs.mkdir(path.dirname(outFile), { recursive: true });
  await fs.writeFile(wrapper, `${lines.join("\n")}\n`);

  const require = createRequire(path.join(webRoot, "package.json"));
  const cliPkg = require.resolve("@tailwindcss/cli/package.json");
  const bin = require(cliPkg).bin;
  const cli = path.join(path.dirname(cliPkg), typeof bin === "string" ? bin : bin.tailwindcss);
  const tailwindArgs = [cli, "-i", wrapper, "-o", outFile];
  if (watch) tailwindArgs.push("--watch");

  await new Promise((resolve, reject) => {
    const child = spawn(execPath, tailwindArgs, {
      cwd: webRoot,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      stdio: watch ? "inherit" : "pipe",
    });
    let stderr = "";
    if (!watch) child.stderr?.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    if (watch) {
      child.on("close", (code) =>
        code === 0 ? resolve() : reject(new Error(`tailwind exited ${code}`)),
      );
      return;
    }
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`tailwind exited ${code}: ${stderr.trim()}`)),
    );
  });

  if (!watch) await fs.rm(wrapper, { force: true });
}

/** Default game CSS entry for the web player dev/build scripts. */
export function webGameCssPath(repoRoot, gameId) {
  return path.join(repoGameDataRoot(repoRoot), gameId, "src", "app.css");
}
