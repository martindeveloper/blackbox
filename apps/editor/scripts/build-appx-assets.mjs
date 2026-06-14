#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SOURCE = path.join(ROOT, "public", "icon.png");
const APPX_DIR = path.join(ROOT, "resources", "appx");
const TILE_BACKGROUND = { r: 0, g: 0, b: 0, alpha: 1 };

async function writeSquareLogo(name, size) {
  await sharp(SOURCE).resize(size, size, { fit: "cover" }).png().toFile(path.join(APPX_DIR, name));
}

async function writeWideLogo() {
  const icon150 = await sharp(SOURCE).resize(150, 150, { fit: "cover" }).png().toBuffer();

  await sharp({
    create: {
      width: 310,
      height: 150,
      channels: 4,
      background: TILE_BACKGROUND,
    },
  })
    .composite([{ input: icon150, left: 80, top: 0 }])
    .png()
    .toFile(path.join(APPX_DIR, "Wide310x150Logo.png"));
}

await fs.mkdir(APPX_DIR, { recursive: true });

await Promise.all([
  writeSquareLogo("StoreLogo.png", 50),
  writeSquareLogo("Square44x44Logo.png", 44),
  writeSquareLogo("Square150x150Logo.png", 150),
  writeWideLogo(),
]);

console.log(`AppX assets ready: ${APPX_DIR}`);
