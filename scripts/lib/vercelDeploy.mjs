import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

/** Write a Vercel project file for deploying directly from www/ (no outputDirectory nesting). */
export function writeWwwVercelConfig(wwwDir, templatePath) {
  const config = JSON.parse(readFileSync(templatePath, "utf8"));
  delete config.outputDirectory;
  writeFileSync(path.join(wwwDir, "vercel.json"), `${JSON.stringify(config, null, 2)}\n`);
}

export function deployWwwToVercel(wwwDir, { templatePath, env = process.env } = {}) {
  if (!existsSync(wwwDir)) {
    throw new Error(`missing web build output at ${wwwDir}`);
  }

  writeWwwVercelConfig(wwwDir, templatePath);

  execFileSync("vercel", ["deploy", "--prod", "--archive=tgz"], {
    cwd: wwwDir,
    stdio: "inherit",
    env,
    shell: process.platform === "win32",
  });
}
