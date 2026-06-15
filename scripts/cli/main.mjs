#!/usr/bin/env node
import { BUILD_CONFIGURATIONS, resolveProject } from "../lib/adventure.mjs";
import * as android from "./platforms/android.mjs";
import * as ios from "./platforms/ios.mjs";
import * as web from "./platforms/web.mjs";
import { fail } from "./lib/run.mjs";

const PLATFORMS = { web, ios, android };
const STAGES = new Set(["lint", "build", "bundle", "package"]);
const DEPLOY_TARGETS = new Set(["vercel"]);
const DEPLOY_STAGES = new Set(["build", "package"]);

function parseArgs(argv) {
  const options = {
    project: null,
    platform: null,
    stage: null,
    deploy: null,
    configuration: "release",
    noBuild: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--no-build") {
      options.noBuild = true;
    } else if (arg.startsWith("--project=")) {
      options.project = arg.slice("--project=".length);
    } else if (arg === "--project" && argv[i + 1]) {
      options.project = argv[++i];
    } else if (arg.startsWith("--platform=")) {
      options.platform = arg.slice("--platform=".length);
    } else if (arg === "--platform" && argv[i + 1]) {
      options.platform = argv[++i];
    } else if (arg.startsWith("--stage=")) {
      options.stage = arg.slice("--stage=".length);
    } else if (arg === "--stage" && argv[i + 1]) {
      options.stage = argv[++i];
    } else if (arg.startsWith("--deploy=")) {
      options.deploy = arg.slice("--deploy=".length);
    } else if (arg === "--deploy" && argv[i + 1]) {
      options.deploy = argv[++i];
    } else if (arg.startsWith("--configuration=")) {
      options.configuration = arg.slice("--configuration=".length);
    } else if (arg === "--configuration" && argv[i + 1]) {
      options.configuration = argv[++i];
    } else {
      fail("cli", `unknown argument: ${arg}`);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Blackbox unified build CLI

Usage:
  node cli.js --project=<path> --platform=<web|ios|android> --stage=<stage> [--deploy=<target>]

Stages:
  lint     Validate scenario content (and web player code for --platform=web)
  build    Compile player + platform project (no distributable artifact)
  bundle   Build platform-specific content bundle(s)
  package  Produce a publish-ready artifact (archive / ipa / aab)

Options:
  --project <path>     Adventure root or scenario.json path (required)
  --platform <name>    web | ios | android (required)
  --stage <name>       lint | build | bundle | package (required)
  --deploy <target>    Publish after build/package (web only; currently: vercel)
  --configuration <name>
                       debug | release (default: release)
  --no-build           Reuse the last web player build where applicable
  -h, --help           Show this help

Deploy:
  --deploy=vercel      Runs \`vercel deploy --prod --archive=tgz\` from the built www/
                       Requires --platform=web, --configuration=release, and --stage=build or package

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
        "signing": { "teamId": "XXXXXXXXXX", "method": "app-store" }
      },
      "android": {
        "applicationId": "com.example.mygame",
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
  BLACKBOX_ADVENTURE / BLACKBOX_CONFIGURATION / BLACKBOX_APP_ID_BASE
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

function validateDeploy(options, platform, stage, configuration) {
  if (!options.deploy) return;

  const target = options.deploy.toLowerCase();
  if (!DEPLOY_TARGETS.has(target)) {
    fail("cli", `unknown deploy target "${options.deploy}" — expected vercel`);
  }
  if (platform !== "web") {
    fail("cli", `--deploy=${target} is only supported for --platform=web`);
  }
  if (!DEPLOY_STAGES.has(stage)) {
    fail("cli", `--deploy=${target} requires --stage=build or --stage=package`);
  }
  if (configuration === "debug") {
    fail("cli", "--deploy requires --configuration=release");
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  if (!options.project || !options.platform || !options.stage) {
    printHelp();
    fail("cli", "--project, --platform, and --stage are required");
  }

  const platform = options.platform.toLowerCase();
  const stage = options.stage.toLowerCase();
  const configuration = normalizeConfiguration(options.configuration);
  const handlers = PLATFORMS[platform];
  if (!handlers) {
    fail("cli", `unknown platform "${options.platform}" — expected web, ios, or android`);
  }
  if (!STAGES.has(stage)) {
    fail("cli", `unknown stage "${options.stage}" — expected lint, build, bundle, or package`);
  }

  validateDeploy(options, platform, stage, configuration);

  const project = resolveProject(options.project, { configuration });
  const handler = handlers[`stage${stage[0].toUpperCase()}${stage.slice(1)}`];
  if (!handler) {
    fail("cli", `stage "${stage}" is not implemented for platform "${platform}"`);
  }

  const handlerOptions = { noBuild: options.noBuild, configuration };

  console.log(
    `[cli] ${project.gameId} platform=${platform} stage=${stage} configuration=${configuration} project=${project.root}` +
      (options.deploy ? ` deploy=${options.deploy.toLowerCase()}` : ""),
  );
  handler(project, handlerOptions);

  if (options.deploy) {
    web.stageDeploy(project, { noBuild: true, configuration });
  }
}

main();
