import { copyFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const editorRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = path.resolve(editorRoot, "../../scripts/lib/buildStages.mjs");
const destination = path.join(editorRoot, "shared", "buildStages.js");

copyFileSync(source, destination);
console.log(`Synced canonical build stages -> ${destination}`);
