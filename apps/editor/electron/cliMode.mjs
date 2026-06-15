/**
 * Headless CLI mode for packaged editor binaries and `electron . --cli …` in development.
 *
 * Usage:
 *   Blackbox\ Editor --cli build --project=./game --platform=web
 *   Blackbox\ Editor --cli -- build --project=./game --platform=web
 *   electron . --cli lint --project=./game --platform=web
 */

const EDITOR_CLI_HELP = `Blackbox Editor — headless build CLI

Usage:
  <editor-binary> --cli [--] <action> [options]

Actions and options are the same as \`node cli.js\` (build, bundle, package, lint, prepare).
Run with \`--cli --help\` for full CLI documentation.

Examples:
  Blackbox\\ Editor --cli build --project=./my-game --platform=web --configuration=release
  Blackbox\\ Editor --cli package --project=./my-game --platform=ios
  Blackbox\\ Editor --cli -- lint --project=./my-game --platform=web
`;

/**
 * If argv requests headless CLI mode, return the arguments to forward to cli.js.
 * Otherwise return null (launch the GUI).
 */
export function parseCliMode(argv) {
  const raw = argv.slice(1);

  // Skip the dev entry ("." with `electron .`) or a packaged app binary path.
  let index = 0;
  while (index < raw.length && !raw[index].startsWith("-")) {
    index += 1;
  }

  if (raw[index] !== "--cli") return null;

  let cliArgs = raw.slice(index + 1);
  if (cliArgs[0] === "--") cliArgs = cliArgs.slice(1);
  return cliArgs;
}

export function printEditorCliHelp() {
  console.log(EDITOR_CLI_HELP);
}
