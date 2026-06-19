/** Android platform metadata and native project helpers. */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { escapeXml, iosXcodeSchemeName } from "./platformIos.mjs";

export const ANDROID_ORIENTATIONS = {
  portrait: "portrait",
  portraitUpsideDown: "reversePortrait",
  landscapeLeft: "sensorLandscape",
  landscapeRight: "sensorLandscape",
  landscape: "sensorLandscape",
};

/** Resolve platforms.android.orientations from scenario.json to a manifest value. */
export function resolveAndroidScreenOrientation(raw) {
  if (!raw) return null;
  const list = Array.isArray(raw) ? raw : Array.isArray(raw.phone) ? raw.phone : null;
  if (!list?.length) return null;
  if (list.length === 1 && ANDROID_ORIENTATIONS[list[0]]) {
    return ANDROID_ORIENTATIONS[list[0]];
  }
  if (list.every((item) => item === "portrait" || item === "portraitUpsideDown")) {
    return "portrait";
  }
  if (list.some((item) => item === "landscape" || item.startsWith("landscape"))) {
    return "sensorLandscape";
  }
  return null;
}

/** Gradle project folder name under android/ — matches the iOS Xcode scheme slug. */
export function androidProjectSlug(displayName) {
  return iosXcodeSchemeName(displayName);
}

/** Capacitor android.path relative to the build dir, e.g. android/ExampleGame. */
export function androidProjectRelativePath(displayName) {
  return `android/${androidProjectSlug(displayName)}`;
}

/** Apply platforms.android version, labels, orientation, and applicationId. */
export function applyAndroidPlatformSettings({ androidRoot, config, log = () => {} }) {
  let changed = false;

  const buildGradle = path.join(androidRoot, "app", "build.gradle");
  if (existsSync(buildGradle)) {
    const before = readFileSync(buildGradle, "utf8");
    const after = before
      .replace(/versionCode \d+/, `versionCode ${config.versionCode}`)
      .replace(/versionName "[^"]*"/, `versionName "${config.version}"`)
      .replace(/applicationId "[^"]*"/, `applicationId "${config.applicationId}"`);
    if (after !== before) {
      writeFileSync(buildGradle, after);
      changed = true;
    }
  }

  const stringsXml = path.join(androidRoot, "app", "src", "main", "res", "values", "strings.xml");
  if (existsSync(stringsXml)) {
    const before = readFileSync(stringsXml, "utf8");
    let after = before
      .replace(
        /<string name="app_name">[^<]*<\/string>/,
        `<string name="app_name">${escapeXml(config.displayName)}</string>`,
      )
      .replace(
        /<string name="title_activity_main">[^<]*<\/string>/,
        `<string name="title_activity_main">${escapeXml(config.displayName)}</string>`,
      );
    if (after !== before) {
      writeFileSync(stringsXml, after);
      changed = true;
    }
  }

  const manifest = path.join(androidRoot, "app", "src", "main", "AndroidManifest.xml");
  if (existsSync(manifest) && config.screenOrientation) {
    const before = readFileSync(manifest, "utf8");
    let after = before.replace(/\s*android:screenOrientation="[^"]*"/, "");
    after = after.replace(
      /<activity([^>]*android:name="\.MainActivity")/,
      `<activity$1\n            android:screenOrientation="${config.screenOrientation}"`,
    );
    if (after !== before) {
      writeFileSync(manifest, after);
      changed = true;
    }
  }

  if (changed) {
    log(
      `applied Android platform settings: display="${config.displayName}" version=${config.version} versionCode=${config.versionCode} applicationId=${config.applicationId}` +
        (config.screenOrientation ? ` orientation=${config.screenOrientation}` : ""),
    );
  }

  const ideaDir = path.join(androidRoot, ".idea");
  if (existsSync(ideaDir)) {
    writeFileSync(path.join(ideaDir, ".name"), `${config.displayName}\n`);
  }
}

export const ANDROID_INJECTED_SIGNING_KEYS = [
  "android.injected.signing.store.file",
  "android.injected.signing.store.password",
  "android.injected.signing.key.alias",
  "android.injected.signing.key.password",
];

export function androidGradlePropsPath(androidRoot) {
  return path.join(androidRoot, "gradle.properties");
}

export function readGradlePropsLines(androidRoot) {
  const gradleProps = androidGradlePropsPath(androidRoot);
  if (!existsSync(gradleProps)) return null;
  return readFileSync(gradleProps, "utf8").split("\n");
}

export function writeGradlePropsLines(androidRoot, lines) {
  writeFileSync(androidGradlePropsPath(androidRoot), lines.filter(Boolean).join("\n") + "\n");
}

/** Remove injected signing so debug builds use the default debug keystore. */
export function clearAndroidInjectedSigning({ androidRoot, log = () => {} }) {
  const lines = readGradlePropsLines(androidRoot);
  if (!lines) return;

  const filtered = lines.filter(
    (line) => !ANDROID_INJECTED_SIGNING_KEYS.some((key) => line.startsWith(`${key}=`)),
  );
  if (filtered.length === lines.length) return;

  writeGradlePropsLines(androidRoot, filtered);
  log("cleared Android release signing from gradle.properties (debug builds only)");
}

/** Configure gradle.properties for release signing before bundleRelease. */
export function applyAndroidReleaseConfig({ androidRoot, platformConfig, log = () => {} }) {
  const lines = readGradlePropsLines(androidRoot);
  if (!lines || !platformConfig.keystore) return;

  if (!existsSync(platformConfig.keystore.path)) {
    throw new Error(`release keystore not found: ${platformConfig.keystore.path}`);
  }

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
  writeGradlePropsLines(androidRoot, lines);
  log("configured Android release signing in gradle.properties");
}

// Capacitor 8 defaults — keep in sync with @capacitor/cli android-template variables.gradle.
export const ENGINE_ANDROID_MIN_SDK = 24;
export const ENGINE_ANDROID_DEFAULT_COMPILE_SDK = 36;
export const ENGINE_ANDROID_DEFAULT_TARGET_SDK = 36;

function parseSdkInt(value) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Effective Android SDK levels — defaults only when unset; floors enforced by validateAndroidSdkConfig. */
export function resolveAndroidSdk(raw = {}) {
  return {
    minSdk: raw.minSdk == null ? ENGINE_ANDROID_MIN_SDK : parseSdkInt(raw.minSdk),
    compileSdk:
      raw.compileSdk == null ? ENGINE_ANDROID_DEFAULT_COMPILE_SDK : parseSdkInt(raw.compileSdk),
    targetSdk:
      raw.targetSdk == null ? ENGINE_ANDROID_DEFAULT_TARGET_SDK : parseSdkInt(raw.targetSdk),
  };
}

export function validateAndroidSdkConfig(raw = {}) {
  const checks = [];
  const minSdk = raw.minSdk == null ? null : parseSdkInt(raw.minSdk);
  const compileSdk = raw.compileSdk == null ? null : parseSdkInt(raw.compileSdk);
  const targetSdk = raw.targetSdk == null ? null : parseSdkInt(raw.targetSdk);

  if (raw.minSdk != null && minSdk == null) {
    checks.push({ severity: "error", message: `invalid platforms.android.minSdk "${raw.minSdk}"` });
  } else if (minSdk != null && minSdk < ENGINE_ANDROID_MIN_SDK) {
    checks.push({
      severity: "error",
      message: `platforms.android.minSdk must be at least ${ENGINE_ANDROID_MIN_SDK}`,
    });
  }

  if (raw.compileSdk != null && compileSdk == null) {
    checks.push({
      severity: "error",
      message: `invalid platforms.android.compileSdk "${raw.compileSdk}"`,
    });
  } else if (compileSdk != null && compileSdk < ENGINE_ANDROID_DEFAULT_COMPILE_SDK) {
    checks.push({
      severity: "error",
      message: `platforms.android.compileSdk must be at least ${ENGINE_ANDROID_DEFAULT_COMPILE_SDK}`,
    });
  }

  if (raw.targetSdk != null && targetSdk == null) {
    checks.push({
      severity: "error",
      message: `invalid platforms.android.targetSdk "${raw.targetSdk}"`,
    });
  } else if (targetSdk != null && targetSdk < ENGINE_ANDROID_DEFAULT_TARGET_SDK) {
    checks.push({
      severity: "error",
      message: `platforms.android.targetSdk must be at least ${ENGINE_ANDROID_DEFAULT_TARGET_SDK}`,
    });
  }

  if (checks.some((check) => check.severity === "error")) {
    return checks;
  }

  const effective = resolveAndroidSdk(raw);
  if (effective.targetSdk < effective.minSdk) {
    checks.push({
      severity: "error",
      message: "platforms.android.targetSdk cannot be less than minSdk",
    });
  }
  if (effective.compileSdk < effective.targetSdk) {
    checks.push({
      severity: "error",
      message: "platforms.android.compileSdk cannot be less than targetSdk",
    });
  }

  return checks;
}

/** Apply SDK levels to the generated Capacitor Android project. */
export function applyAndroidSdkSettings({ androidRoot, config, log = () => {} }) {
  const variablesGradle = path.join(androidRoot, "variables.gradle");
  if (!existsSync(variablesGradle)) return;

  const before = readFileSync(variablesGradle, "utf8");
  const after = before
    .replace(/minSdkVersion = \d+/, `minSdkVersion = ${config.minSdk}`)
    .replace(/compileSdkVersion = \d+/, `compileSdkVersion = ${config.compileSdk}`)
    .replace(/targetSdkVersion = \d+/, `targetSdkVersion = ${config.targetSdk}`);

  if (after === before) return;

  writeFileSync(variablesGradle, after);
  log(
    `applied Android SDK settings: minSdk=${config.minSdk} compileSdk=${config.compileSdk} targetSdk=${config.targetSdk}`,
  );
}
