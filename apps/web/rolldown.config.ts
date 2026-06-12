import { defineConfig } from "rolldown";

export default defineConfig({
  input: "./src/main.tsx",
  platform: "browser",
  external: ["/pkg/blackbox_wasm.js"],
  transform: {
    jsx: "react-jsx",
  },
  output: {
    file: "./dist/www/app.js",
    format: "esm",
  },
});
