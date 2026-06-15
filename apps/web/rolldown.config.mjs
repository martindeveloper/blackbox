import { defineConfig } from "rolldown";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveBuildConfiguration, resolveBuildPlatform } from "../../scripts/lib/adventure.mjs";
import { resolveWebBuildAliases } from "../../scripts/lib/webBuildAliases.mjs";
import { resolveWebPlayerGame, resolveWebOutDir } from "./scripts/lib/adventureDev.mjs";
import { createWebRolldownResolve } from "../../scripts/lib/webRolldownResolve.mjs";

const WEB_ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(WEB_ROOT, "../..");

const { gameSrc } = resolveWebPlayerGame(process.env, WEB_ROOT, REPO_ROOT);
const appJs = path.join(resolveWebOutDir(process.env), "www", "app.js");
const buildAliases = resolveWebBuildAliases(WEB_ROOT, {
  platform: resolveBuildPlatform(process.env),
  configuration: resolveBuildConfiguration(process.env),
  target: "player",
});

export default defineConfig({
  cwd: WEB_ROOT,
  input: "./src/main.tsx",
  platform: "browser",
  external: ["/pkg/blackbox_wasm.js"],
  resolve: createWebRolldownResolve(WEB_ROOT, {
    gameSrc,
    aliases: {
      ...buildAliases,
      "@content-source": path.join(WEB_ROOT, "src", "engine", "lib", "bundleSource.ts"),
    },
  }),
  transform: {
    jsx: "react-jsx",
  },
  output: {
    file: appJs,
    format: "esm",
  },
});
