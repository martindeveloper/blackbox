import { defineConfig } from "rolldown";

export default defineConfig({
  input: "./src/preview/main.tsx",
  platform: "browser",
  external: ["/pkg/blackbox_wasm.js"],
  resolve: {
    tsconfigFilename: "tsconfig.bundler.json",
    alias: {
      "@game": new URL("src/games/editor-preview", import.meta.url).pathname,
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
