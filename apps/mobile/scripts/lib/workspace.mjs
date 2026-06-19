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
 *     android/<GameName>/               Capacitor native project (android.path)
 *     capacitor.config.json           generated per-adventure
 *     package.json                    lists Capacitor deps (for plugin detection)
 *     node_modules -> apps/mobile/node_modules (symlink, for the cap CLI)
 *
 * Nothing adventure-specific is ever written under apps/mobile.
 */
import { execFileSync } from "node:child_process";
import { displayPath } from "../../../../scripts/lib/paths.mjs";
import { runSync } from "../../../../scripts/lib/spawn.mjs";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePlatformConfig, resolveProject, slugifyGameId, DEFAULT_BG, wasmProfileForConfiguration } from "../../../../scripts/lib/adventure.mjs";
import { playerBuildEnv } from "../../../../scripts/cli/lib/buildEnv.mjs";
import {
  installAndroidLauncherIcons,
  installIosAppIcon,
} from "../../../../scripts/lib/platformIcons.mjs";
import {
  installAndroidSplash,
  installIosSplash,
} from "../../../../scripts/lib/platformSplash.mjs";
import {
  applyAndroidPlatformSettings,
  applyAndroidReleaseConfig,
  androidProjectRelativePath,
  clearAndroidInjectedSigning,
} from "../../../../scripts/lib/platformAndroid.mjs";
import {
  applyIosPlatformSettings,
  iosXcodeSchemeName,
} from "../../../../scripts/lib/platformIos.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const MOBILE_ROOT = path.resolve(HERE, "..", "..");
export const REPO_ROOT = path.resolve(MOBILE_ROOT, "..", "..");
const WEB_ROOT = path.join(REPO_ROOT, "apps", "web");
const NATIVE_SRC = path.join(MOBILE_ROOT, "src");
const NATIVE_IOS = path.join(MOBILE_ROOT, "native", "ios");
const CAP_CLI = path.join(MOBILE_ROOT, "node_modules", "@capacitor", "cli", "bin", "capacitor");

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

function webDistFor(adv) {
  return adv.webWwwDir ?? path.join(adv.buildDir, "web", "www");
}

/** Build apps/web for the adventure and assemble <buildDir>/www with the native layer. */
export function buildPayload(
  adv,
  { noBuild = false, platform, bundleInput = null } = {},
) {
  if (!platform) {
    fail("buildPayload requires platform (ios, android, or web)");
  }
  const www = path.join(adv.buildDir, "www");
  const webDist = webDistFor(adv);
  const configuration = adv.configuration ?? process.env.BLACKBOX_CONFIGURATION ?? "release";

  if (!noBuild) {
    log(`building web player (adventure: ${displayPath(adv.scenario)}, platform=${platform})`);
    // Same as scripts/cli/lib/run.mjs runWebPlayerBuild: invoke build.mjs with the current
    // runtime so packaged editors never depend on npm on PATH (macOS GUI apps often lack it).
    runSync(process.execPath, [path.join(WEB_ROOT, "scripts", "build.mjs")], {
      cwd: WEB_ROOT,
      env: {
        ...playerBuildEnv({ root: adv.root, configuration }, configuration, platform),
        PROFILE: wasmProfileForConfiguration(configuration),
        ...(bundleInput ? { BLACKBOX_BUNDLE_INPUT_DIR: bundleInput } : {}),
      },
    });
  }
  if (!existsSync(webDist)) {
    fail(`missing ${webDist} — run without --no-build first.`);
  }

  log(`assembling payload -> ${displayPath(www)}`);
  mkdirSync(adv.buildDir, { recursive: true });
  writeFileSync(path.join(adv.buildDir, ".gitignore"), "*\n"); // make build dir self-ignoring
  rmSync(www, { recursive: true, force: true });
  mkdirSync(www, { recursive: true });
  cpSync(webDist, www, { recursive: true });

  cpSync(path.join(NATIVE_SRC, "native.css"), path.join(www, "native.css"));
  cpSync(path.join(NATIVE_SRC, "native.js"), path.join(www, "native.js"));

  const shellConfig = loadPlatformConfig(adv, platform);
  const nativeShell = {
    safeAreaColor: shellConfig.safeAreaColor ?? shellConfig.backgroundColor ?? DEFAULT_BG,
    safeAreaMode: shellConfig.safeAreaMode ?? "band",
  };

  const indexPath = path.join(www, "index.html");
  let html = readFileSync(indexPath, "utf8");
  const shellScript = `<script>window.__BB_NATIVE_SHELL__=${JSON.stringify(nativeShell)};</script>`;
  if (html.includes("__BB_NATIVE_SHELL__")) {
    html = html.replace(
      /<script>window\.__BB_NATIVE_SHELL__=.*?<\/script>\n?/,
      `${shellScript}\n    `,
    );
  } else if (!html.includes("native.js")) {
    html = html.replace(
      '<script type="module" src="/app.js"></script>',
      `${shellScript}\n    <script src="/native.js"></script>\n    <script type="module" src="/app.js"></script>`,
    );
  } else {
    html = html.replace(
      '<script src="/native.js"></script>',
      `${shellScript}\n    <script src="/native.js"></script>`,
    );
  }
  if (!html.includes("native.css")) {
    html = html.replace(
      '<link rel="stylesheet" href="/style.css" />',
      '<link rel="stylesheet" href="/style.css" />\n    <link rel="stylesheet" href="/native.css" />',
    );
  }
  if (!html.includes("native.js")) {
    html = html.replace(
      '<script type="module" src="/app.js"></script>',
      `${shellScript}\n    <script src="/native.js"></script>\n    <script type="module" src="/app.js"></script>`,
    );
  }
  writeFileSync(indexPath, html);
}

function loadPlatformConfig(adv, platform) {
  if (adv.platform) return adv.platform;
  const project = resolveProject(adv.root, { configuration: adv.configuration });
  return resolvePlatformConfig(project, platform);
}

/** Capacitor android.path relative to the build dir, e.g. android/ExampleGame. */
export function androidProjectPath(adv) {
  const config = loadPlatformConfig(adv, "android");
  return androidProjectRelativePath(config.displayName);
}

/** Absolute path to the generated Gradle project root. */
export function androidRootFor(adv) {
  return path.join(adv.buildDir, androidProjectPath(adv));
}

/** Move a legacy flat build/debug/android/ tree into android/<GameName>/ for Studio recents. */
function migrateLegacyAndroidLayout(adv) {
  const targetRoot = androidRootFor(adv);
  if (existsSync(path.join(targetRoot, "gradlew"))) return;

  const parent = path.join(adv.buildDir, "android");
  if (!existsSync(path.join(parent, "gradlew"))) return;

  const slug = path.basename(targetRoot);
  mkdirSync(targetRoot, { recursive: true });
  for (const ent of readdirSync(parent)) {
    if (ent === slug) continue;
    renameSync(path.join(parent, ent), path.join(targetRoot, ent));
  }
  log(`relocated Android project -> ${displayPath(targetRoot)}`);
}

/** Write the disposable Capacitor workspace (config, package.json, node_modules symlink). */
export function ensureWorkspace(adv, platform = "ios") {
  mkdirSync(adv.buildDir, { recursive: true });

  const platformConfig = loadPlatformConfig(adv, platform);
  const iosConfig = loadPlatformConfig(adv, "ios");
  const androidConfig = loadPlatformConfig(adv, "android");
  const safeAreaMode = platformConfig.safeAreaMode ?? "band";
  const safeAreaEnabled = safeAreaMode !== "none";
  const overlaysWebView = safeAreaMode !== "band";
  const iosScheme = iosXcodeSchemeName(iosConfig.displayName ?? iosConfig.appName);
  const config = {
    appId: platformConfig.bundleId ?? platformConfig.applicationId,
    appName: platformConfig.displayName,
    webDir: "www",
    backgroundColor: platformConfig.backgroundColor ?? DEFAULT_BG,
    ios: {
      scheme: iosScheme,
      contentInset: "never",
      scrollEnabled: false,
      backgroundColor: iosConfig.backgroundColor ?? DEFAULT_BG,
      preferredContentMode: "mobile",
      limitsNavigationsToAppBoundDomains: true,
    },
    android: {
      path: androidProjectPath(adv),
      backgroundColor: androidConfig.backgroundColor ?? DEFAULT_BG,
    },
    plugins: {
      SplashScreen: {
        // Keep LaunchScreen.storyboard visible until native.js calls SplashScreen.hide().
        // launchShowDuration must be non-zero or iOS never mounts the overlay (Capacitor quirk).
        launchShowDuration: 60000,
        launchAutoHide: false,
        backgroundColor: platformConfig.splash?.backgroundColor ?? platformConfig.backgroundColor ?? DEFAULT_BG,
        showSpinner: false,
      },
      StatusBar: {
        style: "DARK",
        // "bleed" and "none" require the webview under the status bar. In "band"
        // mode Capacitor intentionally places it below the bar. This option is
        // active on iOS too: false moves WKWebView down and inserts a native,
        // solid-color status-bar view, which defeats textured header bleed.
        overlaysWebView,
        backgroundColor: platformConfig.backgroundColor ?? DEFAULT_BG,
      },
      SystemBars: {
        insetsHandling: safeAreaEnabled ? "css" : "disable",
        style: "DARK",
        hidden: false,
        animation: "NONE",
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
  const slug = slugifyGameId(adv.gameId);
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
  // Invoke the Capacitor CLI with process.execPath — the .bin/cap shim uses #!/usr/bin/env node
  // and fails in packaged editors where `node` is not on PATH.
  runSync(process.execPath, [CAP_CLI, ...args], { cwd: adv.buildDir });
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

function nativeAssetRoots(adv, platform) {
  if (platform === "ios") {
    const iosApp = path.join(adv.buildDir, "ios", "App", "App");
    return {
      assetCatalog: path.join(iosApp, "Assets.xcassets"),
      launchStoryboard: path.join(iosApp, "Base.lproj", "LaunchScreen.storyboard"),
    };
  }
  if (platform === "android") {
    return { resDir: path.join(androidRootFor(adv), "app", "src", "main", "res") };
  }
  return null;
}

/** Install splash assets from platforms.<platform>.splash into native projects. */
export async function applyPlatformSplash(adv, platform) {
  const config = loadPlatformConfig(adv, platform);
  const imagePath = config.splash?.image;
  if (!imagePath || !existsSync(imagePath)) return;

  const backgroundColor = config.splash.backgroundColor ?? config.backgroundColor ?? DEFAULT_BG;
  const roots = nativeAssetRoots(adv, platform);
  if (!roots) return;

  if (platform === "ios") {
    await installIosSplash({
      imagePath,
      backgroundColor,
      assetCatalogDir: roots.assetCatalog,
      launchStoryboardPath: roots.launchStoryboard,
    });
    log(`installed iOS splash from ${path.relative(adv.root, imagePath)}`);
    return;
  }

  await installAndroidSplash({ imagePath, resDir: roots.resDir, backgroundColor });
  log(`installed Android splash from ${path.relative(adv.root, imagePath)}`);
}

/** Generate native launcher icons from platforms.<platform>.icon (SVG). */
export async function applyPlatformIcons(adv, platform) {
  const config = loadPlatformConfig(adv, platform);
  if (!config.icon) {
    return;
  }
  if (!existsSync(config.icon)) {
    log(`skipping ${platform} icons: not found at ${config.icon}`);
    return;
  }

  const roots = nativeAssetRoots(adv, platform);
  if (!roots) return;

  if (platform === "ios") {
    const out = await installIosAppIcon({ svgPath: config.icon, assetCatalogDir: roots.assetCatalog });
    if (out) {
      log(`installed iOS app icon from ${path.relative(adv.root, config.icon)}`);
    }
    return;
  }

  const written = await installAndroidLauncherIcons({
    svgPath: config.icon,
    resDir: roots.resDir,
    backgroundColor: config.backgroundColor ?? DEFAULT_BG,
  });
  if (written?.length) {
    log(`installed Android launcher icons from ${path.relative(adv.root, config.icon)}`);
  }
}

/** Install splash and launcher icons for a native platform. */
export async function applyPlatformAssets(adv, platform) {
  await applyPlatformSplash(adv, platform);
  await applyPlatformIcons(adv, platform);
}

/** Add the iOS platform if missing, otherwise sync; always re-assert native overrides. */
export async function capSyncIos(adv) {
  ensureWorkspace(adv, "ios");
  const iosDir = path.join(adv.buildDir, "ios");
  if (!existsSync(iosDir)) {
    cap(adv, ["add", "ios"]);
  } else {
    cap(adv, ["sync", "ios"]);
  }
  ensureIosDeploymentTarget(adv);
  applyIosPlatformSettings({
    iosAppDir: path.join(adv.buildDir, "ios", "App"),
    config: loadPlatformConfig(adv, "ios"),
    log,
  });
  applyNativeOverrides(adv);
  await applyPlatformAssets(adv, "ios");
}

/** Add the Android platform if missing, otherwise sync. */
export async function capSyncAndroid(adv) {
  ensureWorkspace(adv, "android");
  migrateLegacyAndroidLayout(adv);
  const androidDir = androidRootFor(adv);
  if (!existsSync(path.join(androidDir, "gradlew"))) {
    cap(adv, ["add", "android"]);
  } else {
    cap(adv, ["sync", "android"]);
  }
  applyAndroidPlatformSettings({
    androidRoot: androidDir,
    config: loadPlatformConfig(adv, "android"),
    log,
  });
  clearAndroidInjectedSigning({ androidRoot: androidDir, log });
  await applyPlatformAssets(adv, "android");
}

export function capOpenAndroid(adv) {
  if (!existsSync(path.join(androidRootFor(adv), "gradlew"))) {
    fail("no android project yet — run `node cli.js build --platform=android` first.");
  }
  cap(adv, ["open", "android"]);
}

export function capOpenIos(adv) {
  if (!existsSync(path.join(adv.buildDir, "ios"))) {
    fail("no iOS project yet — execute the iOS Build stage first.");
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

  const schemeName = iosXcodeSchemeName(platformConfig.displayName);
  const packageDir = path.join(adv.buildDir, "package", "ios");
  mkdirSync(packageDir, { recursive: true });
  const archivePath = path.join(packageDir, `${schemeName}.xcarchive`);
  const exportDir = path.join(packageDir, "export");
  rmSync(archivePath, { recursive: true, force: true });
  rmSync(exportDir, { recursive: true, force: true });
  mkdirSync(exportDir, { recursive: true });

  const xcodeArgs = [
    "-workspace",
    workspace,
    "-scheme",
    schemeName,
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

  const ipa = path.join(exportDir, `${schemeName}.ipa`);
  if (!existsSync(ipa)) {
    // xcodebuild names the ipa after the target; fall back to App.ipa for older builds.
    const legacy = path.join(exportDir, "App.ipa");
    if (existsSync(legacy)) return legacy;
    fail(`expected ipa at ${ipa}`);
  }
  log(`created ${displayPath(ipa)}`);
  return ipa;
}

/** Build a release .aab into <buildDir>/package/android/. */
export function packageAndroid(adv, platformConfig) {
  const androidRoot = androidRootFor(adv);
  if (!existsSync(androidRoot)) {
    fail("no Android project — run build/sync first.");
  }

  const packageDir = path.join(adv.buildDir, "package", "android");
  mkdirSync(packageDir, { recursive: true });

  const gradlew = path.join(androidRoot, process.platform === "win32" ? "gradlew.bat" : "gradlew");
  if (!existsSync(gradlew)) {
    fail(`missing gradle wrapper at ${gradlew}`);
  }

  try {
    applyAndroidReleaseConfig({ androidRoot, platformConfig, log });
  } catch (error) {
    fail(error.message);
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
  log(`created ${displayPath(dest)}`);
  return dest;
}
