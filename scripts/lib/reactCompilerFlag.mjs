// Resolves whether the React Compiler runs for an apps/web player build.
// Default ON. Two opt-out channels, in priority order:
//
//   1. BLACKBOX_REACT_COMPILER — set by the Editor build pipeline from its
//      Build-tab checkbox. Values "0"/"false"/"off"/"no" disable; anything else
//      non-empty enables. Empty/unset falls through.
//   2. `npm run … --react-compiler=<true|false>` — npm exposes this as
//      `npm_config_react_compiler`. NOTE: npm encodes `=false` (and `--no-…`) as
//      an EMPTY string, and `=true` as "true", so empty here means "disabled".
//
// The Editor's own app build never consults this — it always compiles.

const FALSEY = /^(0|false|off|no)$/i;

export function reactCompilerEnabled(env = process.env) {
  const explicit = env.BLACKBOX_REACT_COMPILER;
  if (explicit != null && explicit !== "") {
    return !FALSEY.test(explicit.trim());
  }

  const npmFlag = env.npm_config_react_compiler;
  if (npmFlag != null) {
    // npm boolean-false (`--react-compiler=false` / `--no-react-compiler`) arrives as "".
    return !(npmFlag === "" || FALSEY.test(npmFlag.trim()));
  }

  return true;
}
