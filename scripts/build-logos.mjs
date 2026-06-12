#!/usr/bin/env node
// Converts assets/logo.svg into PNG favicons and copies SVG for both apps.
// Requires macOS (uses sips for SVG→PNG rendering).

import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SOURCE_SVG = path.join(ROOT, "assets", "logo.svg");

const TARGETS = [
  {
    dir: path.join(ROOT, "apps", "editor", "public"),
    sizes: [16, 32, 180],
    copySvg: true,
  },
  {
    dir: path.join(ROOT, "apps", "homepage", "public"),
    sizes: [16, 32, 64, 180],
    copySvg: true,
  },
];

function sipsConvert(src, size, out) {
  const result = spawnSync(
    "sips",
    ["-s", "format", "png", src, "-z", String(size), String(size), "--out", out],
    { stdio: "inherit" },
  );
  if (result.status !== 0) throw new Error(`sips failed for ${out}`);
}

for (const target of TARGETS) {
  await fs.mkdir(target.dir, { recursive: true });

  for (const size of target.sizes) {
    const out = path.join(target.dir, `icon-${size}.png`);
    sipsConvert(SOURCE_SVG, size, out);
    console.log(`  wrote ${path.relative(ROOT, out)}`);
  }

  if (target.copySvg) {
    const dest = path.join(target.dir, "logo.svg");
    await fs.copyFile(SOURCE_SVG, dest);
    console.log(`  wrote ${path.relative(ROOT, dest)}`);
  }
}

console.log("Done.");
