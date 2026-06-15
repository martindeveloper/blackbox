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

There is **no default adventure and no assumed path** — you supply it explicitly,
exactly like `npm run dev`:

```bash
BLACKBOX_ADVENTURE='/abs/path/to/adventure' npm run payload
```

`payload` derives both the UI and the content bundle from that one path.
`--adventure <path>` works too. The path may be the adventure root or its
`scenario.json`.

## Scripts

Everything native is namespaced `ios:`. `payload` assembles the web payload — you
rarely call it directly; `ios:*` does it for you. The first `ios:sync`/`ios:run`
creates the iOS project automatically (no separate init step).

| Script | Does |
| --- | --- |
| `payload` | build the player + assemble `build/www` (needs `BLACKBOX_ADVENTURE`) |
| `payload:fast` | reuse the last player build, just reassemble `build/www` |
| `ios:sync` | rebuild payload + add-or-sync the iOS project (+ re-apply overrides) |
| `ios:sync:fast` | reassemble (no rebuild) + sync |
| `ios:open` | open the generated project in Xcode |
| `ios:run` | rebuild payload + sync + launch on the Simulator |

## First-time setup (on your Mac, needs Xcode + CocoaPods)

```bash
cd apps/mobile
npm install
BLACKBOX_ADVENTURE='/Users/martin/Projects/martindeveloper/blackbox/data/silent_archive_game' npm run ios:sync
npm run ios:open         # open in Xcode → pick a Simulator → Run
```

`ios:sync` builds the payload, scaffolds the workspace under the adventure's
`.blackbox/build/`, and runs `cap add ios` on first run. In Xcode: pick a
Simulator (or your device + a signing team) and Run.

## Day-to-day

```bash
# update the app with the latest game and launch it:
BLACKBOX_ADVENTURE='…' npm run ios:run

# only touched native.js / native.css? skip the player rebuild:
npm run ios:sync:fast
```

> Any script that rebuilds the payload (`payload`, `ios:sync`, `ios:run`) needs
> `BLACKBOX_ADVENTURE` in its environment — prefix it the same way each time.
> The `:fast` variants reuse the last build and don't need it.

## What makes it feel native (not a webview)

- **No white flash** — launch screen, status bar, and webview background are all
  `#070503` (the game's darkest surface). `native.js` holds the native splash
  until React's first paint into `#root`, then cross-fades.
- **No rubber-band** — `native.css` pins `<body>` and disables root overscroll;
  the player's own panels still scroll internally.
- **Haptics** — Medium tap on story choices, Light on other controls.
- **No web tells** — pinch-zoom, tap highlight, text selection, and the
  long-press callout are all suppressed (inputs stay selectable).
- **Clears the Dynamic Island** — `StatusBar.overlaysWebView: false` insets the
  webview below the status bar / island, so the game header never collides with
  it. The full-bleed background art (a fixed `z-index:-1` layer) starts just
  below the island; the strip behind the bar is the `#070503` theme color.
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
signing, icons, splash paths). When those sections are absent, `appName` falls
back to the scenario `title` and `appId` defaults to
`$BLACKBOX_APP_ID_BASE` (default `dev.blackbox`) + the sanitized game id.

## Unified build CLI (CI)

All platforms share one headless entry point at the repo root:

```bash
node cli.js --project='/abs/path/to/adventure' --platform=web|ios|android --stage=lint|build|bundle|package
```

| Stage | What it does |
| --- | --- |
| `lint` | `blackbox-lint` on the scenario (+ web player oxlint for `--platform=web`) |
| `build` | Compile the web player; iOS/Android also sync the Capacitor native project |
| `bundle` | Platform-specific content bundle via `blackbox-bundler` |
| `package` | Publish-ready artifact: web `.tar.gz`, iOS `.ipa`, Android `.aab` |

Platform publish settings live in `scenario.json` under `platforms`:

```json
{
  "platforms": {
    "web": { "appName": "My Game", "outputName": "my-game-web" },
    "ios": {
      "bundleId": "com.example.mygame",
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
```

See `node cli.js --help` for the full option list.
