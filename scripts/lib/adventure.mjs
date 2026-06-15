import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { resolveAndroidScreenOrientation } from "./platformAndroid.mjs";
import { resolveIosCategory, resolveIosOrientations } from "./platformIos.mjs";

const DEFAULT_APP_ID_BASE = "dev.blackbox";
export const DEFAULT_BG = "#070503";
export const BUILD_CONFIGURATIONS = new Set(["debug", "release"]);
export const BUILD_PLATFORMS = new Set(["web", "ios", "android"]);

export function slugifyGameId(gameId) {
  return gameId.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function readScenarioJson(scenarioPath) {
  try {
    return JSON.parse(readFileSync(scenarioPath, "utf8"));
  } catch (error) {
    throw new Error(`failed to parse ${scenarioPath}: ${error.message}`);
  }
}

function resolveEnvValue(value, { required = true } = {}) {
  if (typeof value !== "string") return value;
  if (value.startsWith("env:")) {
    const name = value.slice(4);
    const fromEnv = process.env[name];
    if (!fromEnv) {
      if (!required) return null;
      throw new Error(`missing environment variable ${name} (referenced as ${value})`);
    }
    return fromEnv;
  }
  return value;
}

function resolveMaybeEnvObject(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const out = { ...obj };
  for (const key of ["storePassword", "keyPassword", "password"]) {
    if (typeof out[key] === "string") {
      out[key] = resolveEnvValue(out[key], { required: false });
    }
  }
  for (const key of ["storePasswordEnv", "keyPasswordEnv", "passwordEnv"]) {
    if (typeof out[key] === "string") {
      const envName = out[key];
      const fromEnv = process.env[envName];
      const target = key.replace(/Env$/, "");
      out[target] = fromEnv ?? null;
    }
  }
  return out;
}

/** Player shell target: `web`, `ios`, or `android`. */
export function resolveBuildPlatform(env = process.env) {
  const raw = (env.BLACKBOX_PLATFORM ?? env.BUNDLE_PLATFORM ?? "web").toLowerCase();
  if (!BUILD_PLATFORMS.has(raw)) {
    throw new Error(`invalid platform "${raw}" — expected web, ios, or android`);
  }
  return raw;
}

/** Build output variant: `debug` (dev tooling) or `release` (production). */
export function resolveBuildConfiguration(env = process.env) {
  const raw = (env.BLACKBOX_CONFIGURATION ?? "release").toLowerCase();
  if (!BUILD_CONFIGURATIONS.has(raw)) {
    throw new Error(`invalid configuration "${raw}" — expected debug or release`);
  }
  return raw;
}

export function wasmProfileForConfiguration(configuration) {
  return configuration === "debug" ? "dev" : "release";
}

/** Resolve an adventure from a project root or scenario.json path. */
export function resolveProject(raw, { configuration, env = process.env } = {}) {
  if (!raw) {
    throw new Error("no project specified — pass --project <path>");
  }

  const resolved = path.resolve(raw);
  let root;
  let scenarioPath;

  if (path.basename(resolved) === "scenario.json") {
    scenarioPath = resolved;
    root = path.dirname(resolved);
  } else if (existsSync(resolved) && statSync(resolved).isDirectory()) {
    root = resolved;
    scenarioPath = path.join(resolved, "scenario.json");
  } else {
    throw new Error(`project path not found: ${resolved}`);
  }

  if (!existsSync(scenarioPath)) {
    throw new Error(`scenario.json not found at ${scenarioPath}`);
  }

  const scenario = readScenarioJson(scenarioPath);
  const gameId = path.basename(root);
  const title = scenario.title ?? scenario.name ?? gameId;
  const revision = scenario.revision ?? "0";
  const resolvedConfiguration = configuration ?? resolveBuildConfiguration(env);
  const buildDir = path.join(root, ".blackbox", "build", resolvedConfiguration);

  return {
    root,
    scenarioPath,
    scenario,
    gameId,
    title,
    revision,
    configuration: resolvedConfiguration,
    buildDir,
    webOutDir: path.join(buildDir, "web"),
    webWwwDir: path.join(buildDir, "web", "www"),
    mobileWwwDir: path.join(buildDir, "www"),
    bundleDir: (platform) => path.join(buildDir, "bundle", platform),
    packageDir: (platform) => path.join(buildDir, "package", platform),
  };
}

/** Platform-specific publish config from scenario.json `platforms` (with sane defaults). */
export function resolvePlatformConfig(project, platform) {
  const platforms = project.scenario.platforms ?? {};
  const raw = platforms[platform] ?? {};
  const slug = slugifyGameId(project.gameId);
  const appIdBase = process.env.BLACKBOX_APP_ID_BASE ?? DEFAULT_APP_ID_BASE;
  const defaultBundleId = `${appIdBase}.${slug}`;

  const shared = {
    appName: raw.appName ?? project.title,
    displayName: raw.displayName ?? raw.appName ?? project.title,
    version: raw.version ?? project.revision,
    backgroundColor: raw.backgroundColor ?? DEFAULT_BG,
    icon: raw.icon ? path.resolve(project.root, raw.icon) : null,
    splash: raw.splash
      ? {
          ...raw.splash,
          image: raw.splash.image ? path.resolve(project.root, raw.splash.image) : null,
          backgroundColor: raw.splash.backgroundColor ?? raw.backgroundColor ?? DEFAULT_BG,
        }
      : null,
  };

  if (platform === "web") {
    const icons = raw.icons ?? {};
    const faviconPath = raw.icon ?? icons.favicon ?? null;
    return {
      ...shared,
      icon: faviconPath ? path.resolve(project.root, faviconPath) : null,
      icons: Object.fromEntries(
        Object.entries(icons).map(([key, value]) => [
          key,
          typeof value === "string" ? path.resolve(project.root, value) : value,
        ]),
      ),
      outputName: raw.outputName ?? `${slug}-web`,
    };
  }

  if (platform === "ios") {
    const signing = resolveMaybeEnvObject(raw.signing ?? {});
    const teamId =
      resolveEnvValue(signing.teamId, { required: false }) ?? process.env.APPLE_TEAM_ID ?? null;
    return {
      ...shared,
      bundleId: raw.bundleId ?? defaultBundleId,
      buildNumber: String(raw.buildNumber ?? raw.versionCode ?? "1"),
      category: resolveIosCategory(raw.category),
      orientations: resolveIosOrientations(raw.orientations),
      signing: {
        teamId,
        method: signing.method ?? "app-store",
        certificate: signing.certificate ?? null,
        provisioningProfile: signing.provisioningProfile ?? null,
        codeSignIdentity: signing.codeSignIdentity ?? null,
      },
    };
  }

  if (platform === "android") {
    const keystore = raw.keystore ? resolveMaybeEnvObject(raw.keystore) : null;
    if (keystore?.path) {
      keystore.path = path.resolve(project.root, keystore.path);
    }
    return {
      ...shared,
      applicationId: raw.applicationId ?? raw.bundleId ?? defaultBundleId,
      versionCode: Number(raw.versionCode ?? raw.buildNumber ?? 1),
      screenOrientation: resolveAndroidScreenOrientation(raw.orientations),
      keystore,
    };
  }

  throw new Error(`unknown platform: ${platform}`);
}
