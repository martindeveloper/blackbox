import { defineConfig } from "rolldown";

// The config runs under Node, but the project tsconfig has no Node types.
declare const process: { env: Record<string, string | undefined> };

const GAME = process.env.BLACKBOX_WEB_PLAYER_GAME ?? "silent-archive";

export default defineConfig({
  input: "./src/main.tsx",
  platform: "browser",
  external: ["/pkg/blackbox_wasm.js"],
  resolve: {
    // tsconfig.json's paths mapping (for the editor/typecheck) pins @game to
    // the default game and would override the alias below; use a paths-less
    // tsconfig for bundling so the env var stays in control.
    tsconfigFilename: "tsconfig.bundler.json",
    alias: {
      "@game": new URL(`src/games/${GAME}`, import.meta.url).pathname,
    },
  },
  transform: {
    jsx: "react-jsx",
  },
  output: {
    file: "./dist/www/app.js",
    format: "esm",
  },
});
