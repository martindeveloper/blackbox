import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, "dist");

await fs.rm(path.join(dist, "app.js"), { force: true });
await fs.rm(path.join(dist, "chunks"), { recursive: true, force: true });
