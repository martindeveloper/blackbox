# Blackbox mobile (Capacitor)

Native iOS (and later Android) shell that wraps the **web player** in a system
WebView. The entire UI — engine WASM, React-DOM components, audio, per-game
theming — ships as-is from `apps/web`. This directory adds only the native shell
and a thin native-feel layer.

> This is the **webview** path. A separate **native-Swift** scaffold lives in
> [`apps/ios`](../ios) (engine via the C ABI, hand-built UIKit/SwiftUI UI). The
> two are independent; pick one. This one maximizes reuse and ships fastest.

## Engine tooling vs. adventure artifacts

`apps/mobile/` contains **only engine tooling** — nothing adventure-specific is
ever written here. Each adventure's app is generated into **its own** disposable,
git-ignored build dir and can be deleted and regenerated at any time.

```
apps/mobile/                       ENGINE TOOLING (tracked)
  src/native.{js,css}              native-feel layer (splash, haptics, no-bounce…)
  native/ios/AppDelegate.swift     native override (AVAudioSession) — re-applied every sync
  scripts/                         the generators

<adventure>/.blackbox/build/       GENERATED · DISPOSABLE · git-ignored
  www/                             web payload = apps/web dist + native layer
  ios/                             the Capacitor Xcode project
  capacitor.config.json            generated per-adventure (appId/appName from scenario)
  node_modules -> apps/mobile/node_modules   (symlink, for the cap CLI)
```

The build dir drops a `.gitignore` (`*`) into itself, so it stays out of the
adventure's repo no matter how that repo is configured. (`.blackbox/build/` is
also where the web `dist` will move to over time — the unified per-adventure
build output.)

Because the project is regenerated, the one native customization we need (the
`AVAudioSession` setup) lives in the engine at `native/ios/AppDelegate.swift` and
is copied over the generated `AppDelegate` on **every** sync.

## Selecting the adventure

There is **no default adventure and no assumed path** — you supply it explicitly:

```bash
BLACKBOX_ADVENTURE='/abs/path/to/adventure' npm run ios:sync
```

`--adventure <path>` works too. The path may be the adventure root or its
`scenario.json`.

## Scripts

The mobile scripts are thin wrappers over the unified build pipeline. The first
`ios:sync`/`ios:run` creates the iOS project automatically.

| Script | Does |
| --- | --- |
| `ios:sync` | execute the canonical iOS Build stage |
| `ios:sync:fast` | execute Build with `--no-build` to reuse the prior web player |
| `ios:open` | open the generated project in Xcode |
| `ios:run` | execute Build, then launch through the iOS platform hook |
| `android:sync` | execute the canonical Android Build stage |
| `android:run` | execute Build, then launch through the Android platform hook |

## First-time setup (on your Mac, needs Xcode + CocoaPods)

```bash
cd apps/mobile
npm install
BLACKBOX_ADVENTURE='/Users/martin/Projects/martindeveloper/blackbox/data/silent_archive_game' npm run ios:sync
npm run ios:open         # open in Xcode → pick a Simulator → Run
```

`ios:sync` runs the same Build stage used by the CLI and Editor, scaffolds under
`.blackbox/build/`, and runs `cap add ios` on first run. In Xcode: pick a
Simulator (or your device + a signing team) and Run.

## Day-to-day

```bash
# update the app with the latest game and launch it:
BLACKBOX_ADVENTURE='…' npm run ios:run

# only touched native.js / native.css? skip the player rebuild:
npm run ios:sync:fast
```

> Mobile scripts need `BLACKBOX_ADVENTURE` (or `--adventure`) so the shared
> pipeline knows which project to build.

## What makes it feel native (not a webview)

- **No white flash** — launch screen, status bar, and webview background are all
  `#070503` (the game's darkest surface). `native.js` holds the native splash
  until React's first paint into `#root`, then cross-fades.
- **No rubber-band** — `native.css` pins `<body>` and disables root overscroll;
  the player's own panels still scroll internally.
- **Haptics** — Medium tap on story choices, Light on other controls.
- **No web tells** — pinch-zoom, tap highlight, text selection, and the
  long-press callout are all suppressed (inputs stay selectable).
- **Clears the Dynamic Island / camera cutout** — when `platforms.ios` /
  `platforms.android` `safeStatusBarMargin` is true (the default), Capacitor 8
  `SystemBars` with `insetsHandling: "css"` injects `--safe-area-inset-*` on Android
  (status bar + display cutout). `native.css` pads the game header and menus with those
  insets (and `env(safe-area-inset-*)` on iOS) so titles never collide with the clock,
  notch, or punch-hole. Full-bleed background art is unchanged. Set
  `safeStatusBarMargin: false` in scenario.json to disable.
- **Game audio, not "media"** — `AppDelegate.swift` sets the `AVAudioSession`
  category to `.ambient` (`.mixWithOthers`). Without it, WKWebView's WebAudio is
  treated as `.playback` media and hijacks the Now Playing / Dynamic Island
  "track playing" UI. `.ambient` = no Now Playing, mixes with other apps, obeys
  the mute switch — the conventional game behavior.
- **Local-only** — content is served over `capacitor://`; no network, no dev
  server in the shipped app.

## ⚠️ Validate first: audio backgrounding

The single real risk in the webview path. The iOS audio engine is a hand-tuned
WebAudio buffer setup that self-suspends on `visibilitychange` / `pagehide`.
Inside WKWebView those events are unreliable on background, so `native.js`
bridges Capacitor's `appStateChange` to a synthetic `pagehide` on pause.

On a **real device** (not just the simulator), confirm:

1. First touch unlocks audio; music loops.
2. Background the app → music stops cleanly. Foreground → it resumes.
3. Incoming call / Control Center interruption recovers without a stuck context.

If WebAudio misbehaves on background or audio-route changes, move **music** to a
native audio plugin and keep SFX in WebAudio — don't rebuild the whole layer.
See `project_ios_audio_architecture` in memory for the invariants that must hold.

## Configuration

The Capacitor config is **generated** per-adventure into `.blackbox/build/
capacitor.config.json` by [`scripts/lib/workspace.mjs`](scripts/lib/workspace.mjs)
— that's the source of truth for native-feel settings. App identity comes from
`scenario.json` → `platforms.ios` / `platforms.android` (bundle ID, app name,
signing, icons, splash paths, category, and orientations). Each platform
declares its own `icon` SVG under `platform/<platform>/` — the build renders PNGs
the same way web turns `platforms.web.icon` into `favicon.ico` / `game-icon.png`
(via `sharp`). iOS writes a 1024×1024 `AppIcon`; Android fills all `mipmap-*`
launcher slots and sets `ic_launcher_background` from `backgroundColor`.

`platforms.ios` also supports `displayName` (Xcode Display Name),
`category` (`"games"` → App Store Games), and `orientations` (`"portrait"`,
`"landscape"`, etc. per `iphone` / `ipad`). When those sections are absent, `appName` falls back to the scenario `title` and `appId` defaults to
`$BLACKBOX_APP_ID_BASE` (default `dev.blackbox`) + the sanitized game id.

## Unified build CLI (CI)

All platforms share one headless entry point at the repo root:

```bash
node cli.js prepare
node cli.js build --project='/abs/path/to/adventure' --platform=web|ios|android
```

`prepare` bootstraps the repo (npm + Rust deps, toolchain checks).

| Stage | What it does |
| --- | --- |
| `lint` | `blackbox-lint` on the scenario (+ web player oxlint for `--platform=web`) |
| `build` | Compile the web player; iOS/Android also sync the Capacitor native project |
| `bundle` | Platform-specific content bundle via `blackbox-bundler` |
| `package` | Publish-ready artifact: web `.tar.gz`, iOS `.ipa`, Android `.aab` |

Actions: `lint`, `build`, `bundle`, `package` (positional first argument).

Platform publish settings live in `scenario.json` under `platforms`:

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
```

See `node cli.js --help` for the full option list.
