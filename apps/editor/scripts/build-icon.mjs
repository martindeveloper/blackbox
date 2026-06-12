#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SOURCE = path.join(ROOT, "public", "icon.png");
const RESOURCES_DIR = path.join(ROOT, "resources");
const DIST_DIR = path.join(ROOT, "dist");
const APP_ICON = path.join(RESOURCES_DIR, "icon.png");

async function resizeWithSips(size, output) {
  const result = spawnSync("sips", ["-z", String(size), String(size), APP_ICON, "--out", output], {
    stdio: "inherit",
  });
  return result.status === 0;
}

async function writeDistIcons() {
  const targets = [
    { size: 16, name: "icon-16.png" },
    { size: 32, name: "icon-32.png" },
    { size: 180, name: "icon-180.png" },
  ];

  await fs.mkdir(DIST_DIR, { recursive: true });

  if (process.platform === "darwin") {
    for (const target of targets) {
      const output = path.join(DIST_DIR, target.name);
      if (!(await resizeWithSips(target.size, output))) {
        throw new Error(`failed to generate ${target.name}`);
      }
    }
    return;
  }

  for (const target of targets) {
    await fs.copyFile(APP_ICON, path.join(DIST_DIR, target.name));
  }
}

await fs.mkdir(RESOURCES_DIR, { recursive: true });
await fs.copyFile(SOURCE, APP_ICON);
await writeDistIcons();
console.log(`App icon ready: ${APP_ICON}`);
