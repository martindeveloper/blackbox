#!/usr/bin/env node

import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runSync } from "../../../scripts/lib/spawn.mjs";

const clientRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const distWww = path.join(clientRoot, "dist", "www");
const distDir = path.join(clientRoot, "dist");

rmSync(distWww, { recursive: true, force: true });
runSync("npm", ["run", "build"], { cwd: clientRoot });
runSync("vercel", ["deploy", "--prod", "--archive=tgz"], { cwd: distDir });
