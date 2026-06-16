// Focused ESLint pass for the React Compiler's Rules-of-React diagnostics
// (eslint-plugin-react-hooks v6 "recommended-latest"). oxlint stays the primary
// linter; this exists only to catch violations the React Compiler would otherwise
// silently mis-compile — e.g. reading a mutable store during render (the
// useAssetScope / useSyncExternalStore incident that blanked all images).
import reactHooks from "eslint-plugin-react-hooks";
import tsParser from "@typescript-eslint/parser";

const recommended = reactHooks.configs["recommended-latest"];
const rules = Object.assign(
  {},
  ...(Array.isArray(recommended) ? recommended : [recommended]).map((c) => c.rules ?? {}),
);

export default [
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaFeatures: { jsx: true }, sourceType: "module" },
    },
    rules,
  },
];
