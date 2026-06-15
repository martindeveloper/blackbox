/**
 * Shared helpers for the per-adventure mobile build.
 *
 * Layout:
 *   apps/mobile/                      engine tooling (tracked)
 *     native/ios/AppDelegate.swift    native override copied into generated app
 *     src/native.{js,css}             native-feel layer
 *     scripts/                        these generators
 *   <adventure>/.blackbox/build/      generated, disposable, git-ignored
 *     www/                            web payload (apps/web dist + native layer)
 *     ios/                            Capacitor native project
 *     capacitor.config.json          generated per-adventure
 *     package.json                    lists Capacitor deps (for plugin detection)
 *     node_modules -> apps/mobile/node_modules (symlink, for the cap CLI)
 *
 * Nothing adventure-specific is ever written under apps/mobile.
 */
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const MOBILE_ROOT = path.resolve(HERE, "..", "..");
export const REPO_ROOT = path.resolve(MOBILE_ROOT, "..", "..");
const WEB_ROOT = path.join(REPO_ROOT, "apps", "web");
const WEB_DIST = path.join(WEB_ROOT, "dist", "www");
const NATIVE_SRC = path.join(MOBILE_ROOT, "src");
const NATIVE_IOS = path.join(MOBILE_ROOT, "native", "ios");
const CAP_BIN = path.join(MOBILE_ROOT, "node_modules", ".bin", "cap");

// Game's darkest surface — matches the Silent Archive theme's --color-bg so the
// launch screen / status-bar strip never flash a different color.
const BG = "#070503";

// Capacitor 8 requires iOS 15+. Older generated projects may still say 13.0 in
// Podfile / pbxproj; CocoaPods fails pod install until those are bumped.
const IOS_MIN_VERSION = "15.0";

export function log(msg) {
  console.log(`[mobile] ${msg}`);
}

function fail(msg) {
  console.error(`[mobile] ${msg}`);
  process.exit(1);
}

/** Resolve the adventure from --adventure <path> or $BLACKBOX_ADVENTURE. No assumptions. */
export function resolveAdventure(argv) {
  const flagIdx = argv.indexOf("--adventure");
  const raw = flagIdx !== -1 ? argv[flagIdx + 1] : process.env.BLACKBOX_ADVENTURE;
  if (!raw) {
    fail(
      "no adventure specified. Set BLACKBOX_ADVENTURE or pass --adventure <path>.\n" +
        "  e.g. BLACKBOX_ADVENTURE='/abs/path/to/adventure' npm run ios:run",
    );
  }
  const resolved = path.resolve(raw);
  const scenario =
    existsSync(resolved) && statSync(resolved).isDirectory()
      ? path.join(resolved, "scenario.json")
      : resolved;
  if (path.basename(scenario) !== "scenario.json" || !existsSync(scenario)) {
    fail(`no scenario.json at ${raw}`);
  }
  const root = path.dirname(scenario);
  let title = path.basename(root);
  try {
    const parsed = JSON.parse(readFileSync(scenario, "utf8"));
    title = parsed.title ?? parsed.name ?? title;
  } catch {
    /* keep folder-name fallback */
  }
  const buildDir = path.join(root, ".blackbox", "build");
  return { root, scenario, gameId: path.basename(root), title, buildDir };
}

/** Build apps/web for the adventure and assemble <buildDir>/www with the native layer. */
export function buildPayload(adv, { noBuild = false } = {}) {
  const www = path.join(adv.buildDir, "www");

  if (!noBuild) {
    log(`building web player (adventure: ${path.relative(REPO_ROOT, adv.scenario)})`);
    execFileSync("npm", ["run", "build", "--prefix", WEB_ROOT], {
      stdio: "inherit",
      env: { ...process.env, BLACKBOX_ADVENTURE: adv.root },
    });
  }
  if (!existsSync(WEB_DIST)) {
    fail(`missing ${WEB_DIST} — run without --no-build first.`);
  }

  log(`assembling payload -> ${path.relative(REPO_ROOT, www)}`);
  mkdirSync(adv.buildDir, { recursive: true });
  writeFileSync(path.join(adv.buildDir, ".gitignore"), "*\n"); // make build dir self-ignoring
  rmSync(www, { recursive: true, force: true });
  mkdirSync(www, { recursive: true });
  cpSync(WEB_DIST, www, { recursive: true });

  cpSync(path.join(NATIVE_SRC, "native.css"), path.join(www, "native.css"));
  cpSync(path.join(NATIVE_SRC, "native.js"), path.join(www, "native.js"));

  const indexPath = path.join(www, "index.html");
  let html = readFileSync(indexPath, "utf8");
  if (!html.includes("native.css")) {
    html = html.replace(
      '<link rel="stylesheet" href="/style.css" />',
      '<link rel="stylesheet" href="/style.css" />\n    <link rel="stylesheet" href="/native.css" />',
    );
  }
  if (!html.includes("native.js")) {
    html = html.replace(
      '<script type="module" src="/app.js"></script>',
      '<script src="/native.js"></script>\n    <script type="module" src="/app.js"></script>',
    );
  }
  writeFileSync(indexPath, html);
}

/** Write the disposable Capacitor workspace (config, package.json, node_modules symlink). */
export function ensureWorkspace(adv) {
  mkdirSync(adv.buildDir, { recursive: true });

  const appIdBase = process.env.BLACKBOX_APP_ID_BASE ?? "dev.blackbox";
  const slug = adv.gameId.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  const config = {
    appId: `${appIdBase}.${slug}`,
    appName: adv.title,
    webDir: "www",
    backgroundColor: BG,
    ios: {
      contentInset: "never",
      scrollEnabled: false,
      backgroundColor: BG,
      preferredContentMode: "mobile",
      limitsNavigationsToAppBoundDomains: true,
    },
    plugins: {
      SplashScreen: { launchAutoHide: false, backgroundColor: BG, showSpinner: false },
      StatusBar: { style: "DARK", overlaysWebView: false, backgroundColor: BG },
    },
  };
  writeFileSync(
    path.join(adv.buildDir, "capacitor.config.json"),
    JSON.stringify(config, null, 2) + "\n",
  );

  // package.json so the cap CLI detects the installed plugins. Deps mirror the
  // engine tooling's runtime deps (resolved via the node_modules symlink below).
  const toolingPkg = JSON.parse(readFileSync(path.join(MOBILE_ROOT, "package.json"), "utf8"));
  writeFileSync(
    path.join(adv.buildDir, "package.json"),
    JSON.stringify(
      { name: `bb-build-${slug}`, private: true, version: "0.0.0", dependencies: toolingPkg.dependencies },
      null,
      2,
    ) + "\n",
  );

  const nmLink = path.join(adv.buildDir, "node_modules");
  if (!existsSync(nmLink)) {
    symlinkSync(path.join(MOBILE_ROOT, "node_modules"), nmLink, "dir");
  }
}

function cap(adv, args) {
  execFileSync(CAP_BIN, args, { stdio: "inherit", cwd: adv.buildDir });
}

/** Bump stale iOS deployment targets before CocoaPods runs. */
function ensureIosDeploymentTarget(adv) {
  const iosAppDir = path.join(adv.buildDir, "ios", "App");
  const podfile = path.join(iosAppDir, "Podfile");
  if (existsSync(podfile)) {
    const before = readFileSync(podfile, "utf8");
    const after = before.replace(
      /platform :ios, '(\d+\.\d+)'/,
      (_, ver) => `platform :ios, '${parseFloat(ver) < parseFloat(IOS_MIN_VERSION) ? IOS_MIN_VERSION : ver}'`,
    );
    if (after !== before) {
      writeFileSync(podfile, after);
      log(`raised iOS deployment target in Podfile -> ${IOS_MIN_VERSION}`);
    }
  }

  const pbxproj = path.join(iosAppDir, "App.xcodeproj", "project.pbxproj");
  if (existsSync(pbxproj)) {
    const before = readFileSync(pbxproj, "utf8");
    const after = before.replace(
      /IPHONEOS_DEPLOYMENT_TARGET = (\d+\.\d+);/g,
      (match, ver) =>
        parseFloat(ver) < parseFloat(IOS_MIN_VERSION)
          ? `IPHONEOS_DEPLOYMENT_TARGET = ${IOS_MIN_VERSION};`
          : match,
    );
    if (after !== before) {
      writeFileSync(pbxproj, after);
      log(`raised iOS deployment target in Xcode project -> ${IOS_MIN_VERSION}`);
    }
  }
}

/** Copy the engine's AppDelegate override into the generated project, enforcing it every run. */
function applyNativeOverrides(adv) {
  const dest = path.join(adv.buildDir, "ios", "App", "App", "AppDelegate.swift");
  const src = path.join(NATIVE_IOS, "AppDelegate.swift");
  if (existsSync(src) && existsSync(path.dirname(dest))) {
    cpSync(src, dest);
    log("applied native override: AppDelegate.swift");
  }
}

/** Add the iOS platform if missing, otherwise sync; always re-assert native overrides. */
export function capSyncIos(adv) {
  const iosDir = path.join(adv.buildDir, "ios");
  if (!existsSync(iosDir)) {
    cap(adv, ["add", "ios"]);
  }
  ensureIosDeploymentTarget(adv);
  cap(adv, ["sync", "ios"]);
  applyNativeOverrides(adv);
}

export function capOpenIos(adv) {
  if (!existsSync(path.join(adv.buildDir, "ios"))) {
    fail("no ios project yet — run `npm run ios:sync` first.");
  }
  cap(adv, ["open", "ios"]);
}

export function capRunIos(adv) {
  cap(adv, ["run", "ios"]);
}
