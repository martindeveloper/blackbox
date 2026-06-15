import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DEFAULT_BG } from "./adventure.mjs";
import { loadSharp, loadToIco } from "./platformSharp.mjs";

/** Render an SVG source to a square PNG buffer. */
export async function renderSvgToPng(svgPath, size) {
  const svg = readFileSync(svgPath);
  return loadSharp()(svg).resize(size, size).png().toBuffer();
}

export async function renderSvgToPngFile(svgPath, size, outPath) {
  mkdirSync(path.dirname(outPath), { recursive: true });
  const png = await renderSvgToPng(svgPath, size);
  writeFileSync(outPath, png);
  return outPath;
}

/** Web favicon bundle: favicon.svg, favicon.ico, game-icon.png. */
export async function buildWebFaviconBundle(svgPath, wwwDir) {
  const toIco = loadToIco();
  const sharp = loadSharp();
  const svg = readFileSync(svgPath);
  mkdirSync(wwwDir, { recursive: true });

  writeFileSync(path.join(wwwDir, "favicon.svg"), svg);
  await sharp(svg).resize(1024, 1024).png().toFile(path.join(wwwDir, "game-icon.png"));

  const sizes = [16, 32, 48];
  const pngs = await Promise.all(
    sizes.map((size) => sharp(svg).resize(size, size).png().toBuffer()),
  );
  writeFileSync(path.join(wwwDir, "favicon.ico"), await toIco(pngs));

  return {
    faviconSvg: path.join(wwwDir, "favicon.svg"),
    faviconIco: path.join(wwwDir, "favicon.ico"),
    gameIconPng: path.join(wwwDir, "game-icon.png"),
  };
}

/** Capacitor 8 iOS asset catalog: single 1024×1024 universal icon. */
export async function installIosAppIcon({ svgPath, assetCatalogDir }) {
  const appiconset = path.join(assetCatalogDir, "AppIcon.appiconset");
  if (!existsSync(appiconset)) {
    return null;
  }

  const outFile = path.join(appiconset, "AppIcon-512@2x.png");
  await renderSvgToPngFile(svgPath, 1024, outFile);
  return outFile;
}

const ANDROID_LAUNCHER_SIZES = [
  { folder: "mipmap-mdpi", size: 48, foreground: 108 },
  { folder: "mipmap-hdpi", size: 72, foreground: 162 },
  { folder: "mipmap-xhdpi", size: 96, foreground: 216 },
  { folder: "mipmap-xxhdpi", size: 144, foreground: 324 },
  { folder: "mipmap-xxxhdpi", size: 192, foreground: 432 },
];

function writeAndroidLauncherBackground(resDir, backgroundColor) {
  const valuesDir = path.join(resDir, "values");
  mkdirSync(valuesDir, { recursive: true });
  writeFileSync(
    path.join(valuesDir, "ic_launcher_background.xml"),
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${backgroundColor}</color>\n</resources>\n`,
  );
}

/** Capacitor Android launcher mipmaps from an SVG source icon. */
export async function installAndroidLauncherIcons({
  svgPath,
  resDir,
  backgroundColor = DEFAULT_BG,
}) {
  if (!existsSync(resDir)) {
    return null;
  }

  writeAndroidLauncherBackground(resDir, backgroundColor);

  const tasks = [];
  for (const { folder, size, foreground } of ANDROID_LAUNCHER_SIZES) {
    const dir = path.join(resDir, folder);
    mkdirSync(dir, { recursive: true });

    for (const name of ["ic_launcher.png", "ic_launcher_round.png"]) {
      tasks.push(renderSvgToPngFile(svgPath, size, path.join(dir, name)));
    }
    tasks.push(
      renderSvgToPngFile(svgPath, foreground, path.join(dir, "ic_launcher_foreground.png")),
    );
  }

  return Promise.all(tasks);
}
