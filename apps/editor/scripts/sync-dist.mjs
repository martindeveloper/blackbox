import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DIST = path.join(ROOT, "dist");
const PUBLIC = path.join(ROOT, "public");

await fs.mkdir(DIST, { recursive: true });
await fs.copyFile(path.join(ROOT, "index.html"), path.join(DIST, "index.html"));
await fs.copyFile(
  path.join(ROOT, "node_modules", "@xyflow", "react", "dist", "style.css"),
  path.join(DIST, "xyflow.css"),
);

try {
  const entries = await fs.readdir(PUBLIC);
  for (const entry of entries) {
    await fs.copyFile(path.join(PUBLIC, entry), path.join(DIST, entry));
  }
} catch {}
