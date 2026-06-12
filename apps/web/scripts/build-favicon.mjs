import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import toIco from "to-ico";

const clientRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const assetsDir = join(clientRoot, "assets");
const faviconPath = join(assetsDir, "favicon.svg");
const iconPath = join(assetsDir, "game-icon.png");
const icoPath = join(assetsDir, "favicon.ico");

const sizes = [16, 32, 48];
const favicon = readFileSync(faviconPath);

await sharp(favicon).resize(1024, 1024).png().toFile(iconPath);

const pngs = await Promise.all(
  sizes.map((size) => sharp(favicon).resize(size, size).png().toBuffer()),
);

const ico = await toIco(pngs);
writeFileSync(icoPath, ico);

console.log(`built ${iconPath} and ${icoPath} from favicon.svg (${sizes.join(", ")}px)`);
