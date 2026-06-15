#!/usr/bin/env node
import { BUILD_CONFIGURATIONS, resolveProject } from "../lib/adventure.mjs";
import * as android from "./platforms/android.mjs";
import * as ios from "./platforms/ios.mjs";
import { stagePrepare } from "./prepare.mjs";
import * as web from "./platforms/web.mjs";
import { fail } from "./lib/run.mjs";

const PLATFORMS = { web, ios, android };
const ACTIONS = new Set(["prepare", "lint", "build", "bundle", "package"]);
const PROJECT_ACTIONS = new Set(["lint", "build", "bundle", "package"]);
const DEPLOY_TARGETS = new Set(["vercel"]);
const DEPLOY_ACTIONS = new Set(["build", "package"]);
const WEB_SERVER_ACTIONS = new Set(["build", "bundle", "package"]);

function parseArgs(argv) {
  const options = {
    action: null,
    project: null,
    platform: null,
    deploy: null,
    configuration: "release",
    noBuild: false,
    webSpawnServer: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--no-build") {
      options.noBuild = true;
    } else if (arg === "--web-spawn-server") {
      options.webSpawnServer = true;
    } else if (arg.startsWith("--project=")) {
      options.project = arg.slice("--project=".length);
    } else if (arg === "--project" && argv[i + 1]) {
      options.project = argv[++i];
    } else if (arg.startsWith("--platform=")) {
      options.platform = arg.slice("--platform=".length);
    } else if (arg === "--platform" && argv[i + 1]) {
      options.platform = argv[++i];
    } else if (arg.startsWith("--stage=") || arg === "--stage") {
      fail(
        "cli",
        "use a positional action instead of --stage (e.g. `node cli.js build --project=...`)",
      );
    } else if (arg.startsWith("--deploy=")) {
      options.deploy = arg.slice("--deploy=".length);
    } else if (arg === "--deploy" && argv[i + 1]) {
      options.deploy = argv[++i];
    } else if (arg.startsWith("--configuration=")) {
      options.configuration = arg.slice("--configuration=".length);
    } else if (arg === "--configuration" && argv[i + 1]) {
      options.configuration = argv[++i];
    } else if (arg.startsWith("-")) {
      fail("cli", `unknown option: ${arg}`);
    } else if (!options.action) {
      options.action = arg;
    } else {
      fail("cli", `unexpected argument: ${arg}`);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Blackbox unified build CLI

Usage:
  node cli.js prepare
  node cli.js <action> --project=<path> --platform=<web|ios|android> [options]

Actions:
  prepare  Install repo dependencies and verify the development toolchain
  lint     Validate scenario content (and web player code for --platform=web)
  build    Compile player + platform project (no distributable artifact)
  bundle   Build platform-specific content bundle(s)
  package  Produce a publish-ready artifact (archive / ipa / aab)

Options:
  --project <path>     Adventure root or scenario.json path (required for lint/build/bundle/package)
  --platform <name>    web | ios | android (required for lint/build/bundle/package)
  --deploy <target>    Publish after build/package (web only; currently: vercel)
  --configuration <name>
                       debug | release (default: release)
  --no-build           Reuse the last web player build where applicable
  --web-spawn-server   After a web build, start the static player server (web only)
  -h, --help           Show this help

Examples:
  node cli.js prepare
  node cli.js build --project=data/silent_archive_game --platform=web --configuration=release --web-spawn-server
  node cli.js package --project=data/silent_archive_game --platform=ios
  node cli.js lint --project=data/silent_archive_game --platform=web

Deploy:
  --deploy=vercel      Runs \`vercel deploy --prod --archive=tgz\` from the built www/
                       Requires --platform=web, --configuration=release, and action build or package

Preview:
  --web-spawn-server   Serves <adventure>/.blackbox/build/<configuration>/web/www with apps/web/server.js
                       Requires --platform=web and action build, bundle, or package (Ctrl+C to stop)
                       Honors PORT (default 8080)

Configuration:
  --configuration=debug
                       Dev WASM profile, uncompressed bundles, in-game dev console enabled
  --configuration=release
                       Production WASM profile, zstd bundles (default)

Output layout:
  <adventure>/.blackbox/build/debug/...
  <adventure>/.blackbox/build/release/...

Platform config lives in scenario.json under "platforms":

  {
    "platforms": {
      "web": { "appName": "My Game", "outputName": "my-game-web", "icon": "platform/web/favicon.svg" },
      "ios": {
        "bundleId": "com.example.mygame",
        "appName": "My Game",
        "displayName": "My Game",
        "category": "games",
        "orientations": { "iphone": ["portrait"], "ipad": ["portrait"] },
        "icon": "platform/ios/icon.svg",
        "signing": { "teamId": "XXXXXXXXXX", "method": "app-store" }
      },
      "android": {
        "applicationId": "com.example.mygame",
        "icon": "platform/android/icon.svg",
        "keystore": {
          "path": "release.keystore",
          "storePasswordEnv": "ANDROID_KEYSTORE_PASSWORD",
          "keyAlias": "upload",
          "keyPasswordEnv": "ANDROID_KEY_PASSWORD"
        }
      }
    }
  }

Environment:
  BLACKBOX_ADVENTURE / BLACKBOX_CONFIGURATION / BLACKBOX_PLATFORM / BLACKBOX_APP_ID_BASE
  APPLE_TEAM_ID        Fallback for platforms.ios.signing.teamId
`);
}

function normalizeConfiguration(value) {
  const configuration = value.toLowerCase();
  if (!BUILD_CONFIGURATIONS.has(configuration)) {
    fail("cli", `unknown configuration "${value}" — expected debug or release`);
  }
  return configuration;
}

function validateDeploy(options, platform, action, configuration) {
  if (!options.deploy) return;

  const target = options.deploy.toLowerCase();
  if (!DEPLOY_TARGETS.has(target)) {
    fail("cli", `unknown deploy target "${options.deploy}" — expected vercel`);
  }
  if (platform !== "web") {
    fail("cli", `--deploy=${target} is only supported for --platform=web`);
  }
  if (!DEPLOY_ACTIONS.has(action)) {
    fail("cli", `--deploy=${target} requires action build or package`);
  }
  if (configuration === "debug") {
    fail("cli", "--deploy requires --configuration=release");
  }
}

function validateWebSpawnServer(options, platform, action) {
  if (!options.webSpawnServer) return;

  if (platform !== "web") {
    fail("cli", "--web-spawn-server is only supported for --platform=web");
  }
  if (!WEB_SERVER_ACTIONS.has(action)) {
    fail("cli", "--web-spawn-server requires action build, bundle, or package");
  }
  if (options.deploy) {
    fail("cli", "--web-spawn-server cannot be used with --deploy");
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || !options.action) {
    printHelp();
    if (!options.help && !options.action) {
      fail("cli", "action required — prepare | lint | build | bundle | package");
    }
    return;
  }

  const action = options.action.toLowerCase();
  if (!ACTIONS.has(action)) {
    fail(
      "cli",
      `unknown action "${options.action}" — expected prepare, lint, build, bundle, or package`,
    );
  }

  if (action === "prepare") {
    console.log("[cli] prepare");
    await stagePrepare();
    return;
  }

  if (!options.project || !options.platform) {
    printHelp();
    fail("cli", "--project and --platform are required");
  }

  const platform = options.platform.toLowerCase();
  const configuration = normalizeConfiguration(options.configuration);
  const handlers = PLATFORMS[platform];
  if (!handlers) {
    fail("cli", `unknown platform "${options.platform}" — expected web, ios, or android`);
  }
  if (!PROJECT_ACTIONS.has(action)) {
    fail("cli", `unknown action "${options.action}" — expected lint, build, bundle, or package`);
  }

  validateDeploy(options, platform, action, configuration);
  validateWebSpawnServer(options, platform, action);

  const project = resolveProject(options.project, { configuration });
  const handler = handlers[`stage${action[0].toUpperCase()}${action.slice(1)}`];
  if (!handler) {
    fail("cli", `action "${action}" is not implemented for platform "${platform}"`);
  }

  const handlerOptions = { noBuild: options.noBuild, configuration };

  console.log(
    `[cli] ${action} ${project.gameId} platform=${platform} configuration=${configuration} project=${project.root}` +
      (options.deploy ? ` deploy=${options.deploy.toLowerCase()}` : "") +
      (options.webSpawnServer ? " web-spawn-server" : ""),
  );
  await handler(project, handlerOptions);

  if (options.deploy) {
    await web.stageDeploy(project, { noBuild: true, configuration });
  }

  if (options.webSpawnServer) {
    await web.spawnWebServer(project, { configuration });
  }
}

main().catch((error) => {
  console.error(`[cli] ${error.message}`);
  process.exit(1);
});
