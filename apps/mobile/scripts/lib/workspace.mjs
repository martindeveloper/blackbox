/**
 * Shared helpers for the per-adventure mobile build.
 *
 * Layout:
 *   apps/mobile/                      engine tooling (tracked)
 *     native/ios/AppDelegate.swift    native override copied into generated app
 *     src/native.{js,css}             native-feel layer
 *     scripts/                        these generators
 *   <adventure>/.blackbox/build/<configuration>/   generated, disposable, git-ignored
 *     web/www/                        web player build output
 *     www/                            mobile payload (web/www + native layer)
 *     ios/                            Capacitor native project
 *     android/                        Capacitor native project
 *     capacitor.config.json           generated per-adventure
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
import { resolvePlatformConfig, resolveProject } from "../../../../scripts/lib/adventure.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const MOBILE_ROOT = path.resolve(HERE, "..", "..");
export const REPO_ROOT = path.resolve(MOBILE_ROOT, "..", "..");
const WEB_ROOT = path.join(REPO_ROOT, "apps", "web");
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

  const project = resolveProject(raw);
  return {
    root: project.root,
    scenario: project.scenarioPath,
    gameId: project.gameId,
    title: project.title,
    configuration: project.configuration,
    buildDir: project.buildDir,
    webWwwDir: project.webWwwDir,
  };
}

function webDistFor(adv) {
  return adv.webWwwDir ?? path.join(adv.buildDir, "web", "www");
}

/** Build apps/web for the adventure and assemble <buildDir>/www with the native layer. */
export function buildPayload(adv, { noBuild = false } = {}) {
  const www = path.join(adv.buildDir, "www");
  const webDist = webDistFor(adv);

  if (!noBuild) {
    log(`building web player (adventure: ${path.relative(REPO_ROOT, adv.scenario)})`);
    execFileSync("npm", ["run", "build", "--prefix", WEB_ROOT], {
      stdio: "inherit",
      env: {
        ...process.env,
        BLACKBOX_ADVENTURE: adv.root,
        BLACKBOX_CONFIGURATION: adv.configuration ?? process.env.BLACKBOX_CONFIGURATION ?? "release",
      },
      shell: process.platform === "win32",
    });
  }
  if (!existsSync(webDist)) {
    fail(`missing ${webDist} — run without --no-build first.`);
  }

  log(`assembling payload -> ${path.relative(REPO_ROOT, www)}`);
  mkdirSync(adv.buildDir, { recursive: true });
  writeFileSync(path.join(adv.buildDir, ".gitignore"), "*\n"); // make build dir self-ignoring
  rmSync(www, { recursive: true, force: true });
  mkdirSync(www, { recursive: true });
  cpSync(webDist, www, { recursive: true });

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

function loadPlatformConfig(adv, platform) {
  if (adv.platform) return adv.platform;
  const project = resolveProject(adv.root);
  return resolvePlatformConfig(project, platform);
}

/** Write the disposable Capacitor workspace (config, package.json, node_modules symlink). */
export function ensureWorkspace(adv, platform = "ios") {
  mkdirSync(adv.buildDir, { recursive: true });

  const platformConfig = loadPlatformConfig(adv, platform);
  const config = {
    appId: platformConfig.bundleId ?? platformConfig.applicationId,
    appName: platformConfig.appName,
    webDir: "www",
    backgroundColor: platformConfig.backgroundColor ?? BG,
    ios: {
      contentInset: "never",
      scrollEnabled: false,
      backgroundColor: platformConfig.backgroundColor ?? BG,
      preferredContentMode: "mobile",
      limitsNavigationsToAppBoundDomains: true,
    },
    android: {
      backgroundColor: platformConfig.backgroundColor ?? BG,
    },
    plugins: {
      SplashScreen: {
        launchAutoHide: false,
        backgroundColor: platformConfig.splash?.backgroundColor ?? platformConfig.backgroundColor ?? BG,
        showSpinner: false,
      },
      StatusBar: {
        style: "DARK",
        overlaysWebView: false,
        backgroundColor: platformConfig.backgroundColor ?? BG,
      },
    },
  };
  writeFileSync(
    path.join(adv.buildDir, "capacitor.config.json"),
    JSON.stringify(config, null, 2) + "\n",
  );

  // package.json so the cap CLI detects the installed plugins. Deps mirror the
  // engine tooling's runtime deps (resolved via the node_modules symlink below).
  const toolingPkg = JSON.parse(readFileSync(path.join(MOBILE_ROOT, "package.json"), "utf8"));
  const slug = adv.gameId.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
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
  execFileSync(CAP_BIN, args, {
    stdio: "inherit",
    cwd: adv.buildDir,
    shell: process.platform === "win32",
  });
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
  ensureWorkspace(adv, "ios");
  const iosDir = path.join(adv.buildDir, "ios");
  if (!existsSync(iosDir)) {
    cap(adv, ["add", "ios"]);
  }
  ensureIosDeploymentTarget(adv);
  cap(adv, ["sync", "ios"]);
  applyNativeOverrides(adv);
}

/** Add the Android platform if missing, otherwise sync. */
export function capSyncAndroid(adv) {
  ensureWorkspace(adv, "android");
  const androidDir = path.join(adv.buildDir, "android");
  if (!existsSync(androidDir)) {
    cap(adv, ["add", "android"]);
  }
  cap(adv, ["sync", "android"]);
  applyAndroidReleaseConfig(adv);
}

function applyAndroidReleaseConfig(adv) {
  const platformConfig = loadPlatformConfig(adv, "android");
  const gradleProps = path.join(adv.buildDir, "android", "gradle.properties");
  if (!existsSync(gradleProps) || !platformConfig.keystore) return;

  const lines = readFileSync(gradleProps, "utf8").split("\n");
  const upsert = (key, value) => {
    const idx = lines.findIndex((line) => line.startsWith(`${key}=`));
    const entry = `${key}=${value}`;
    if (idx === -1) lines.push(entry);
    else lines[idx] = entry;
  };

  upsert("android.injected.signing.store.file", platformConfig.keystore.path);
  upsert("android.injected.signing.store.password", platformConfig.keystore.storePassword ?? "");
  upsert("android.injected.signing.key.alias", platformConfig.keystore.keyAlias ?? "upload");
  upsert("android.injected.signing.key.password", platformConfig.keystore.keyPassword ?? "");
  writeFileSync(gradleProps, lines.filter(Boolean).join("\n") + "\n");
  log("configured Android release signing in gradle.properties");
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

export function capRunAndroid(adv) {
  cap(adv, ["run", "android"]);
}

function writeExportOptionsPlist(dest, platformConfig) {
  const method = platformConfig.signing.method ?? "app-store";
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>${method}</string>
  <key>teamID</key>
  <string>${platformConfig.signing.teamId}</string>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>uploadSymbols</key>
  <true/>
</dict>
</plist>
`;
  writeFileSync(dest, plist);
}

/** Archive and export an .ipa into <buildDir>/package/ios/. */
export function packageIos(adv, platformConfig) {
  const iosRoot = path.join(adv.buildDir, "ios", "App");
  const workspace = path.join(iosRoot, "App.xcworkspace");
  if (!existsSync(workspace)) {
    fail("no iOS workspace — run build/sync first.");
  }

  const packageDir = path.join(adv.buildDir, "package", "ios");
  mkdirSync(packageDir, { recursive: true });
  const archivePath = path.join(packageDir, "App.xcarchive");
  const exportDir = path.join(packageDir, "export");
  rmSync(archivePath, { recursive: true, force: true });
  rmSync(exportDir, { recursive: true, force: true });
  mkdirSync(exportDir, { recursive: true });

  const xcodeArgs = [
    "-workspace",
    workspace,
    "-scheme",
    "App",
    "-configuration",
    "Release",
    "-archivePath",
    archivePath,
    "archive",
    `DEVELOPMENT_TEAM=${platformConfig.signing.teamId}`,
    `PRODUCT_BUNDLE_IDENTIFIER=${platformConfig.bundleId}`,
    "CODE_SIGN_STYLE=Automatic",
  ];

  log(`archiving iOS app (${platformConfig.bundleId})`);
  execFileSync("xcodebuild", xcodeArgs, { stdio: "inherit", shell: false });

  const exportPlist = path.join(packageDir, "ExportOptions.plist");
  writeExportOptionsPlist(exportPlist, platformConfig);

  log("exporting .ipa");
  execFileSync(
    "xcodebuild",
    ["-exportArchive", "-archivePath", archivePath, "-exportPath", exportDir, "-exportOptionsPlist", exportPlist],
    { stdio: "inherit", shell: false },
  );

  const ipa = path.join(exportDir, "App.ipa");
  if (!existsSync(ipa)) {
    fail(`expected ipa at ${ipa}`);
  }
  log(`created ${path.relative(REPO_ROOT, ipa)}`);
  return ipa;
}

/** Build a release .aab into <buildDir>/package/android/. */
export function packageAndroid(adv, platformConfig) {
  const androidRoot = path.join(adv.buildDir, "android");
  if (!existsSync(androidRoot)) {
    fail("no Android project — run build/sync first.");
  }

  const packageDir = path.join(adv.buildDir, "package", "android");
  mkdirSync(packageDir, { recursive: true });

  const gradlew = path.join(androidRoot, process.platform === "win32" ? "gradlew.bat" : "gradlew");
  if (!existsSync(gradlew)) {
    fail(`missing gradle wrapper at ${gradlew}`);
  }

  log(`building Android App Bundle (${platformConfig.applicationId})`);
  execFileSync(gradlew, ["bundleRelease"], {
    stdio: "inherit",
    cwd: androidRoot,
    shell: process.platform === "win32",
  });

  const aab = path.join(androidRoot, "app", "build", "outputs", "bundle", "release", "app-release.aab");
  if (!existsSync(aab)) {
    fail(`expected aab at ${aab}`);
  }

  const dest = path.join(packageDir, `${adv.gameId}-release.aab`);
  cpSync(aab, dest);
  log(`created ${path.relative(REPO_ROOT, dest)}`);
  return dest;
}
