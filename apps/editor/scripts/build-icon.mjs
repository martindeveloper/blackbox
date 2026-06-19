#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SOURCE = path.join(ROOT, "public", "icon.png");
const RESOURCES_DIR = path.join(ROOT, "resources");
const DIST_DIR = path.join(ROOT, "dist");
const APP_ICON = path.join(RESOURCES_DIR, "icon.png");

/** macOS app icon plate: 13/16 of the 1024×1024 canvas (Apple HIG). */
const MAC_ICON_CANVAS = 1024;
const MAC_ICON_PLATE = 832;

async function writeMacAppIcon(source, output) {
  const plate = await sharp(source)
    .resize(MAC_ICON_PLATE, MAC_ICON_PLATE, { fit: "cover" })
    .png()
    .toBuffer();
  const inset = Math.floor((MAC_ICON_CANVAS - MAC_ICON_PLATE) / 2);
  await sharp({
    create: {
      width: MAC_ICON_CANVAS,
      height: MAC_ICON_CANVAS,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: plate, left: inset, top: inset }])
    .png()
    .toFile(output);
}

async function resizeWithSips(input, size, output) {
  const result = spawnSync("sips", ["-z", String(size), String(size), input, "--out", output], {
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
      if (!(await resizeWithSips(SOURCE, target.size, output))) {
        throw new Error(`failed to generate ${target.name}`);
      }
    }
    return;
  }

  for (const target of targets) {
    await fs.copyFile(SOURCE, path.join(DIST_DIR, target.name));
  }
}

await fs.mkdir(RESOURCES_DIR, { recursive: true });
await writeMacAppIcon(SOURCE, APP_ICON);
await writeDistIcons();
console.log(`App icon ready: ${APP_ICON}`);
