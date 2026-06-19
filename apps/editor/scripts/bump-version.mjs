#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const editorRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const packageJsonPath = path.join(editorRoot, "package.json");
const packageLockPath = path.join(editorRoot, "package-lock.json");
const editorVersionPath = path.join(editorRoot, "shared", "editorVersion.js");

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)(?:-([\w.-]+))?(?:\+([\w.-]+))?$/;

function usage() {
  console.log(`Bump the Blackbox Editor version across package.json, editorVersion.js, and package-lock.json.

Usage:
  node ./scripts/bump-version.mjs <version>
  node ./scripts/bump-version.mjs patch|minor|major

Examples:
  npm run version:bump -- 0.2.2
  npm run version:bump -- patch
`);
}

function parseVersion(version) {
  const match = SEMVER_RE.exec(version);
  if (!match) {
    throw new Error(`Invalid semver: ${version}`);
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4],
    build: match[5],
  };
}

function formatVersion({ major, minor, patch, prerelease, build }) {
  let version = `${major}.${minor}.${patch}`;
  if (prerelease) {
    version += `-${prerelease}`;
  }
  if (build) {
    version += `+${build}`;
  }
  return version;
}

function bumpVersion(currentVersion, kind) {
  const parsed = parseVersion(currentVersion);

  switch (kind) {
    case "major":
      return formatVersion({ major: parsed.major + 1, minor: 0, patch: 0 });
    case "minor":
      return formatVersion({ major: parsed.major, minor: parsed.minor + 1, patch: 0 });
    case "patch":
      return formatVersion({
        major: parsed.major,
        minor: parsed.minor,
        patch: parsed.patch + 1,
      });
    default:
      throw new Error(`Unknown bump kind: ${kind}`);
  }
}

function readCurrentVersion() {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  if (typeof packageJson.version !== "string" || !packageJson.version.trim()) {
    throw new Error(`Missing version in ${packageJsonPath}`);
  }
  return packageJson.version.trim();
}

function resolveNextVersion(currentVersion, arg) {
  if (arg === "patch" || arg === "minor" || arg === "major") {
    return bumpVersion(currentVersion, arg);
  }

  const nextVersion = arg.trim();
  parseVersion(nextVersion);
  return nextVersion;
}

function writePackageJson(version) {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  packageJson.version = version;
  writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
}

function writeEditorVersion(version) {
  writeFileSync(editorVersionPath, `export const EDITOR_VERSION = "${version}";\n`);
}

function writePackageLock(version) {
  const packageLock = JSON.parse(readFileSync(packageLockPath, "utf8"));
  packageLock.version = version;
  if (packageLock.packages?.[""]) {
    packageLock.packages[""].version = version;
  }
  writeFileSync(packageLockPath, `${JSON.stringify(packageLock, null, 2)}\n`);
}

function main() {
  const arg = process.argv[2];
  if (!arg || arg === "--help" || arg === "-h") {
    usage();
    process.exit(arg ? 0 : 1);
  }

  const currentVersion = readCurrentVersion();
  const nextVersion = resolveNextVersion(currentVersion, arg);

  if (nextVersion === currentVersion) {
    console.log(`Editor version is already ${currentVersion}`);
    return;
  }

  writePackageJson(nextVersion);
  writeEditorVersion(nextVersion);
  writePackageLock(nextVersion);

  console.log(`Bumped editor version: ${currentVersion} -> ${nextVersion}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
