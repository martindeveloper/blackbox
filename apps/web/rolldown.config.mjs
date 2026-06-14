import { defineConfig } from "rolldown";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveWebPlayerGame } from "../../scripts/lib/adventureDev.mjs";
import { createWebRolldownResolve } from "../../scripts/lib/webRolldownResolve.mjs";

const WEB_ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(WEB_ROOT, "../..");

const { gameSrc } = resolveWebPlayerGame(process.env, WEB_ROOT, REPO_ROOT);

export default defineConfig({
  cwd: WEB_ROOT,
  input: "./src/main.tsx",
  platform: "browser",
  external: ["/pkg/blackbox_wasm.js"],
  resolve: createWebRolldownResolve(WEB_ROOT, {
    gameSrc,
    aliases: {
      "@content-source": path.join(WEB_ROOT, "src", "engine", "lib", "bundleSource.ts"),
      "@preview-mode": path.join(WEB_ROOT, "src", "engine", "lib", "previewMode.stub.ts"),
      "@preview-reporter": path.join(WEB_ROOT, "src", "preview", "PreviewReporter.stub.tsx"),
      "@analytics": path.join(WEB_ROOT, "src", "engine", "lib", "vercelAnalytics.ts"),
    },
  }),
  transform: {
    jsx: "react-jsx",
  },
  output: {
    file: "./dist/www/app.js",
    format: "esm",
  },
});
