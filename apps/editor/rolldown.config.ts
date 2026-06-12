import { defineConfig } from "rolldown";

export default defineConfig({
  input: "./src/main.tsx",
  platform: "browser",
  transform: {
    jsx: "react-jsx",
  },
  output: {
    file: "./dist/app.js",
    format: "esm",
  },
});
