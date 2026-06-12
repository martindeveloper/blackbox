import path from "node:path";
import { fileURLToPath } from "node:url";

export function repoRootFrom(importMetaUrl, levelsUp = 1) {
  const start = path.dirname(fileURLToPath(importMetaUrl));
  return path.resolve(start, ...Array(levelsUp).fill(".."));
}
