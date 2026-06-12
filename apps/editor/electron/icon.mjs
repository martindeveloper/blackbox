import fs from "node:fs";
import path from "node:path";
import { nativeImage } from "electron";

export function resolveIconPath(clientRoot) {
  const candidates = [
    path.join(clientRoot, "resources", "icon.png"),
    path.join(process.resourcesPath, "icon.png"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export function loadAppIcon(clientRoot) {
  const iconPath = resolveIconPath(clientRoot);
  if (!iconPath) return null;
  const image = nativeImage.createFromPath(iconPath);
  return image.isEmpty() ? null : image;
}
