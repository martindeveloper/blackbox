import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { repoGameDataRoot } from "./gamePaths.mjs";

function toUrl(filePath) {
  return filePath.replaceAll("\\", "/");
}

async function fontsCssImport(gameSrc) {
  const fontsCss = path.join(gameSrc, "fonts.css");
  try {
    await fs.access(fontsCss);
    return `@import "${toUrl(fontsCss)}";`;
  } catch {
    return null;
  }
}

/** Compile game UI CSS (engine shell + app.css). Prepends src/fonts.css when present. */
export async function buildGameCss({
  webRoot,
  gameSrc,
  outFile,
  execPath = process.execPath,
  watch = false,
  requireFrom = null,
  cacheDir = null,
}) {
  const engineRoot = path.join(webRoot, "src", "engine");
  const engineUi = path.join(engineRoot, "ui");
  const gameApp = path.join(gameSrc, "app.css");
  const requirePath = requireFrom ?? path.join(webRoot, "package.json");
  const depsRoot = path.dirname(requirePath);
  const wrapperDir = cacheDir ?? path.join(webRoot, ".cache", "preview-tailwind");
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
  const fontImport = await fontsCssImport(gameSrc);
  if (fontImport) lines.unshift(fontImport);
  await fs.mkdir(wrapperDir, { recursive: true });
  await fs.mkdir(path.dirname(outFile), { recursive: true });
  await fs.writeFile(wrapper, `${lines.join("\n")}\n`);

  const require = createRequire(requirePath);
  const cliPkg = require.resolve("@tailwindcss/cli/package.json");
  const bin = require(cliPkg).bin;
  const cli = path.join(path.dirname(cliPkg), typeof bin === "string" ? bin : bin.tailwindcss);
  const tailwindArgs = [cli, "-i", wrapper, "-o", outFile];
  if (watch) tailwindArgs.push("--watch");

  await new Promise((resolve, reject) => {
    const child = spawn(execPath, tailwindArgs, {
      cwd: wrapperDir,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        NODE_PATH: path.join(depsRoot, "node_modules"),
      },
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
