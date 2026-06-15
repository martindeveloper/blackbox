#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import { runSync } from "../../../scripts/lib/spawn.mjs";
import { deployWwwToVercel } from "../../../scripts/lib/vercelDeploy.mjs";
import { resolveWebWwwDir } from "./lib/adventureDev.mjs";

const clientRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

runSync("npm", ["run", "build", "--prefix", clientRoot], {
  env: {
    ...process.env,
    BLACKBOX_CONFIGURATION: "release",
    PROFILE: "release",
  },
});

const wwwDir = resolveWebWwwDir({
  ...process.env,
  BLACKBOX_CONFIGURATION: "release",
});

deployWwwToVercel(wwwDir, {
  templatePath: path.join(clientRoot, "vercel.json"),
});
