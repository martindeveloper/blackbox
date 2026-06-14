import { defineConfig } from "rolldown";

// The config runs under Node, but the project tsconfig has no Node types.
declare const process: { env: Record<string, string | undefined> };

// Which game's UI the preview player renders. Defaults to the generic
// `editor-preview` game so distributed/CI editor builds preview any project
// with a game-agnostic UI; set this locally (e.g. `silent-archive`) to preview
// a project with its real App/components/CSS.
const GAME = process.env.BLACKBOX_PREVIEW_GAME ?? "editor-preview";

export default defineConfig({
  input: "./src/preview/main.tsx",
  platform: "browser",
  external: ["/pkg/blackbox_wasm.js"],
  resolve: {
    tsconfigFilename: "tsconfig.bundler.json",
    alias: {
      "@game": new URL(`src/games/${GAME}`, import.meta.url).pathname,
      "@content-source": new URL("src/engine/lib/previewSource.ts", import.meta.url).pathname,
      "@preview-mode": new URL("src/engine/lib/previewMode.ts", import.meta.url).pathname,
      "@preview-protocol": new URL("../editor/shared/previewProtocol.ts", import.meta.url).pathname,
      "@preview-reporter": new URL("src/preview/PreviewReporter.tsx", import.meta.url).pathname,
    },
  },
  transform: {
    jsx: "react-jsx",
  },
  output: {
    file: "./dist/preview/preview.js",
    format: "esm",
  },
});
