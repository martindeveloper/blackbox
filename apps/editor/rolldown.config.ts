import { defineConfig } from "rolldown";
import * as babel from "@babel/core";
import reactCompiler from "babel-plugin-react-compiler";
import { reactCompilerPlugin } from "../../scripts/lib/reactCompilerPlugin.mjs";

export default defineConfig({
  input: "./src/main.tsx",
  platform: "browser",
  tsconfig: "./tsconfig.json",
  plugins: [reactCompilerPlugin({ babel, compilerPlugin: reactCompiler })],
  transform: {
    jsx: "react-jsx",
  },
  output: {
    file: "./dist/app.js",
    format: "esm",
  },
});
