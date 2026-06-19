#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SOURCE = path.join(ROOT, "public", "icon.png");
const APPX_DIR = path.join(ROOT, "resources", "appx");
const TILE_BACKGROUND = { r: 0, g: 0, b: 0, alpha: 1 };
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

/** Windows AppX inner graphic sizes (Visual Studio / Microsoft asset guidance). */
const APPX_PLATE_RATIO = {
  /** StoreLogo fills the canvas. */
  store: 1,
  /** Square44 App List / taskbar: ~70–75% of canvas. */
  appList: 0.72,
  /** Square150 medium tile: ~50% of canvas. */
  medTile: 0.5,
};

async function composeSquareAsset(source, canvasSize, plateRatio, background = TRANSPARENT) {
  const plateSize = Math.round(canvasSize * plateRatio);
  const inset = Math.floor((canvasSize - plateSize) / 2);
  const plate = await sharp(source).resize(plateSize, plateSize, { fit: "cover" }).png().toBuffer();

  return sharp({
    create: {
      width: canvasSize,
      height: canvasSize,
      channels: 4,
      background,
    },
  })
    .composite([{ input: plate, left: inset, top: inset }])
    .png()
    .toBuffer();
}

async function writeSquareLogo(name, canvasSize, plateRatio) {
  const asset = await composeSquareAsset(SOURCE, canvasSize, plateRatio);
  await fs.writeFile(path.join(APPX_DIR, name), asset);
}

async function writeWideLogo() {
  const medTile = await composeSquareAsset(SOURCE, 150, APPX_PLATE_RATIO.medTile, TILE_BACKGROUND);

  await sharp({
    create: {
      width: 310,
      height: 150,
      channels: 4,
      background: TILE_BACKGROUND,
    },
  })
    .composite([{ input: medTile, left: 0, top: 0 }])
    .png()
    .toFile(path.join(APPX_DIR, "Wide310x150Logo.png"));
}

await fs.mkdir(APPX_DIR, { recursive: true });

await Promise.all([
  writeSquareLogo("StoreLogo.png", 50, APPX_PLATE_RATIO.store),
  writeSquareLogo("Square44x44Logo.png", 44, APPX_PLATE_RATIO.appList),
  writeSquareLogo("Square150x150Logo.png", 150, APPX_PLATE_RATIO.medTile),
  writeWideLogo(),
]);

console.log(`AppX assets ready: ${APPX_DIR}`);
