// React Compiler Rules-of-React pass for adventure UI under BLACKBOX_ADVENTURE/src.
// Same rules as eslint.config.mjs; run from the adventure src directory as ESLint cwd.
import reactHooks from "eslint-plugin-react-hooks";
import tsParser from "@typescript-eslint/parser";

const recommended = reactHooks.configs["recommended-latest"];
const rules = Object.assign(
  {},
  ...(Array.isArray(recommended) ? recommended : [recommended]).map((c) => c.rules ?? {}),
);

export default [
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaFeatures: { jsx: true }, sourceType: "module" },
    },
    rules,
  },
];
