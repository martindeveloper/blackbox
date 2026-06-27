---
title: Headless CLI
description: Build, bundle, package, and lint narrative projects from the terminal or CI.
order: 1
---

The Blackbox unified build CLI compiles player code, produces platform bundles, and assembles publish-ready artifacts. It reads platform configuration from `scenario.json` and writes output under `<adventure>/.blackbox/build/`.

## Invocation

**Repository checkout**

```bash
node cli.js <action> [options]
```

**Packaged editor** (development or release binary)

```bash
BlackboxEditor --cli <action> [options]
BlackboxEditor --cli -- lint --project=./my-game --platform=web   # optional `--` separator
BlackboxEditor --cli --help
```

In CI, quote the executable on Windows: `"BlackboxEditor.exe" --cli build ...`.

## Actions

| Action    | Purpose                                                                                  |
| --------- | ---------------------------------------------------------------------------------------- |
| `prepare` | Install repo dependencies and verify the development toolchain. No `--project` required. |
| `lint`    | Validate scenario content (and web player code when `--platform=web`).                   |
| `build`   | Compile the player and platform project. No distributable archive yet.                   |
| `bundle`  | Build platform-specific content bundle(s).                                               |
| `package` | Produce a publish-ready artifact (web archive, `.ipa`, `.aab`).                          |

Project actions require `--project` and `--platform`.

## Platforms and configuration

```bash
--platform web | ios | android
--configuration debug | release   # default: release
```

**Debug** uses the dev WASM profile, uncompressed bundles, and enables the in-game dev console.

**Release** uses the production WASM profile and zstd-compressed bundles.

### Output layout

```
<adventure>/.blackbox/build/debug/...
<adventure>/.blackbox/build/release/...
```

Platform keys live in `scenario.json` under `"platforms"`:

```json
{
  "platforms": {
    "web": {
      "appName": "My Game",
      "outputName": "my-game-web",
      "icon": "platform/web/favicon.svg"
    },
    "ios": {
      "bundleId": "com.example.mygame",
      "appName": "My Game",
      "displayName": "My Game",
      "category": "games",
      "orientations": { "iphone": ["portrait"], "ipad": ["portrait"] },
      "deploymentTarget": "16.0",
      "icon": "platform/ios/icon.svg",
      "signing": { "teamId": "XXXXXXXXXX", "method": "app-store" }
    },
    "android": {
      "applicationId": "com.example.mygame",
      "minSdk": 26,
      "compileSdk": 36,
      "targetSdk": 36,
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
```

## Options

| Flag                      | Description                                                                                   |
| ------------------------- | --------------------------------------------------------------------------------------------- |
| `--project <path>`        | Adventure root or `scenario.json` path                                                        |
| `--deploy <target>`       | Publish after build/package. Web only; currently `vercel`. Requires `release`.                |
| `--no-build`              | Build-stage fast path: reuse the previous compiled web player                                 |
| `--bundle-input <dir>`    | Internal: Build embeds an explicit content bundle                                             |
| `--build-input <dir>`     | Internal: Package consumes a Build-stage artifact                                             |
| `--web-spawn-server`      | After a web build, serve static player from `.blackbox/build/.../www` (port `8080` or `PORT`) |
| `--react-compiler=<bool>` | Compile player UI with React Compiler (default on). `--no-react-compiler` to disable          |
| `-h`, `--help`            | Show full help                                                                                |

`--web-spawn-server` requires `--platform=web` and action `build`, `bundle`, or `package`. It cannot be combined with `--deploy`.

## Examples

```bash
# Toolchain setup (repo checkout)
node cli.js prepare

# Web release build with local preview server
node cli.js build \
  --project=data/silent_archive_game \
  --platform=web \
  --configuration=release \
  --web-spawn-server

# iOS package
node cli.js package --project=data/silent_archive_game --platform=ios

# Lint before merge
node cli.js lint --project=data/silent_archive_game --platform=web

# Deploy web release to Vercel
node cli.js build \
  --project=./my-game \
  --platform=web \
  --configuration=release \
  --deploy=vercel
```

## CI example

```yaml
- name: Build web release
  run: |
    "./BlackboxEditor" --cli build \
      --project="${{ github.workspace }}/games/my-adventure" \
      --platform=web \
      --configuration=release
```

Successful stages may emit a machine-readable artifact path:

```
::blackbox-artifact::/absolute/path/to/output
```

## Environment variables

| Variable                  | Role                                                               |
| ------------------------- | ------------------------------------------------------------------ |
| `BLACKBOX_ADVENTURE`      | Default adventure path                                             |
| `BLACKBOX_CONFIGURATION`  | Default `debug` or `release`                                       |
| `BLACKBOX_PLATFORM`       | Default platform                                                   |
| `BLACKBOX_APP_ID_BASE`    | App ID base for mobile targets                                     |
| `APPLE_TEAM_ID`           | Fallback for `platforms.ios.signing.teamId`                        |
| `BLACKBOX_REACT_COMPILER` | Inherited by the web bundler when `--react-compiler` is not passed |

## Packaged vs checkout

| Capability                    | `node cli.js` (repo)                       | `BlackboxEditor --cli`      |
| ----------------------------- | ------------------------------------------ | --------------------------- |
| Lint / bundle / simulate WASM | Built from source or prior `npm run build` | Pre-bundled in the app      |
| Rust toolchain on runner      | Required for engine rebuilds               | Not required                |
| iOS / Android SDKs            | Required for mobile package                | Required for mobile package |
| Opens editor window           | No                                         | No                          |
