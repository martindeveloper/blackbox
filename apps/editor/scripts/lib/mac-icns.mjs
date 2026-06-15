import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const ICONSET_SIZES = [
  [16, "icon_16x16.png"],
  [32, "icon_16x16@2x.png"],
  [32, "icon_32x32.png"],
  [64, "icon_32x32@2x.png"],
  [128, "icon_128x128.png"],
  [256, "icon_128x128@2x.png"],
  [256, "icon_256x256.png"],
  [512, "icon_256x256@2x.png"],
  [512, "icon_512x512.png"],
  [1024, "icon_512x512@2x.png"],
];

export async function buildIcnsFromPng(pngPath, outputPath) {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "blackbox-icon-"));
  const iconsetDir = path.join(workDir, "icon.iconset");
  await fs.mkdir(iconsetDir);
  try {
    for (const [size, name] of ICONSET_SIZES) {
      const output = path.join(iconsetDir, name);
      const result = spawnSync(
        "sips",
        ["-z", String(size), String(size), pngPath, "--out", output],
        {
          stdio: "ignore",
        },
      );
      if (result.status !== 0) {
        throw new Error(`failed to resize app icon to ${size}x${size}`);
      }
    }

    const result = spawnSync("iconutil", ["-c", "icns", iconsetDir, "-o", outputPath], {
      stdio: "ignore",
    });
    if (result.status !== 0) {
      throw new Error("failed to build app icon (.icns)");
    }
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}
