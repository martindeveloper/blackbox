---
title: Engine API
description: "The stable @engine/sdk/v1 surface for game UI code: component slots, hooks, save state, audio, and shared types."
order: 4
---

A Blackbox web game has two parts: the engine runtime and your game-owned UI. The
engine runs the session, WASM, saves, audio, modals, and default player behavior. Your
game supplies presentation: screens, component slots, styling, notifications, and
small configuration adapters.

Those two parts meet at the **versioned public API** under `@engine/sdk/v1/*`.

## Public vs. internal imports

Use `@engine/sdk/v1/*` for game code. It is the supported contract Blackbox keeps stable
for the lifetime of `v1`.

```ts
import type { GameDefinition } from "@engine/sdk/v1/boot.js";
import { TextGamePlayerApp } from "@engine/sdk/v1/ui/player-app.js";
import type { GameView } from "@engine/sdk/v1/types.js";
```

You may still see deeper modules such as `@engine/lib/*`, `@engine/hooks/*`, or
`@engine/ui/*`. They are intentionally reachable because the engine, editor preview,
and advanced experiments sometimes need them, but they are **private APIs**:

- They may move, change shape, or disappear in a normal engine update.
- They do not carry the `v1` compatibility promise.
- Game projects warn through oxlint when they import them.

For shipped game UI, treat private imports as unsupported. If something important is
missing from `@engine/sdk/v1`, the right fix is to add it to the public surface rather than
build against an internal path.

## Compatibility model

The model is similar to Win32 over operating-system syscalls:

- `@engine/sdk/v1/*` is the public API application code builds against.
- `@engine/lib/*`, `@engine/hooks/*`, and `@engine/ui/*` are implementation modules the
  engine can reorganize behind that public layer.
- Internal implementation details can change between releases; the `v1` names, function
  signatures, component props, and exported types are treated as stable.

That means engine updates can improve runtime behavior, defaults, tooling, or internal
layout without forcing existing game UI to chase file moves. If Blackbox needs a public
contract that cannot preserve a `v1` signature, it should ship as a new version, such as
`@engine/sdk/v2`, while `v1` remains available for existing games.

In short: `@engine/sdk/v1` is the contract; deeper `@engine/*` modules are implementation
details.

## Two ways a game plugs in

### 1. The manifest (`game.ts`)

Map your components into the engine's presentation **slots** and declare player options.

```ts
import type { GameDefinition } from "@engine/sdk/v1/boot.js";
import { App } from "./App.js";
import { en } from "./i18n/en.js";
// ...your components

export const game: GameDefinition = {
  id: "my_game",
  App,
  i18nResources: { en },
  player: {
    components: {
      MainMenu,
      GameScreen, // replace the whole playable screen...
      Choices, // ...or just individual slots
      Narrative,
      Resolution,
      Vitals,
      Inventory,
      Intel,
      Journal,
      SystemMenu,
    },
    saves: { slots: 3 },
    settings: { themes: ["dark"], defaultTheme: "dark" },
  },
};
```

Every slot has a working engine default, so you can override one, several, or all of
them. A custom `GameScreen` composes the other slots itself via `useTextGameComponents()`.

### 2. The shell config (`App.tsx`)

`App` renders the engine-owned `TextGamePlayerApp`, which owns session, audio, saves,
restart, keyboard, and phase routing. You pass small adapters and optional chrome.

```tsx
import { TextGamePlayerApp, type TextGamePlayerAppConfig } from "@engine/sdk/v1/ui/player-app.js";
import { DEFAULT_CHOICE_SFX } from "@engine/sdk/v1/audio.js";

const config: TextGamePlayerAppConfig<"chapter"> = {
  presentation: { collectStateNotifications, rollRevealDelayMs, chapterTransitionMs: 1800 },
  audio: { defaultSfx: DEFAULT_CHOICE_SFX, resolveMusicFade },
  Header: MyHeader, // optional: Header, BootScreen, ChapterTransition, ...
};

export function App() {
  return <TextGamePlayerApp config={config} />;
}
```

### Audio controls

`@engine/sdk/v1/audio` exposes the player audio hook for custom shells and headers.
`useAudio(...)` returns both mixer mute controls and music pause controls:

- `muted` / `toggleMute` control the master audio mix. Muted audio keeps playback state
  running silently.
- `paused` / `togglePause` pause and resume the music channel. Pause fades down quickly,
  stops advancing the current track, then resumes from the saved position.
- `audioBlocked` is true while the browser still requires a user gesture before audio can
  play.

The default `TextGamePlayerApp` header props include the same `muted`, `toggleMute`,
`paused`, `togglePause`, and `audioBlocked` values, so a custom `Header` can choose whether
its button means mixer mute or music pause.

## Component slots

A game provides any of these via `player.components`. Each slot receives a fixed props
contract exported from `@engine/sdk/v1/ui/components.js`.

| Slot         | Renders                                             |
| ------------ | --------------------------------------------------- |
| `MainMenu`   | Save-slot selection screen                          |
| `GameScreen` | The full playable screen (composes the slots below) |
| `Narrative`  | A single text block (dialogue, thought, paragraph)  |
| `Choices`    | The choice / continue / ending list                 |
| `Resolution` | Dice rolls and state-change notifications           |
| `Vitals`     | Player stats strip                                  |
| `Inventory`  | Items and item actions                              |
| `Intel`      | Discovered knowledge / memories                     |
| `Journal`    | Event log                                           |
| `SystemMenu` | Save, load, restart, main menu actions              |

## Module reference

| Module                              | Provides                                                                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `@engine/sdk/v1/types`              | Wire/view types: `GameView`, `TextBlock`, `ChoiceView`, `RollRecord`, `UiNotification`, `CharacterView`, ...                         |
| `@engine/sdk/v1/boot`               | `GameDefinition`, `WebPlayerOptions`, `bootGame`                                                                                     |
| `@engine/sdk/v1/ui/player-app`      | `TextGamePlayerApp` + its `Config`, header, transition, and confirmation prop types                                                  |
| `@engine/sdk/v1/ui/components`      | `useTextGameComponents`, the slot prop types (`ChoicesProps`, `NarrativeProps`, ...)                                                 |
| `@engine/sdk/v1/ui/modal`           | `useModal`, `ModalDescriptor`, `ModalTone`                                                                                           |
| `@engine/sdk/v1/ui/menu`            | `MenuButton`, `SettingsPanel`                                                                                                        |
| `@engine/sdk/v1/state/save-load`    | Save slots: `readAllSlots`, `readSlot`, `clearSlot`, `clearAllPlayerData`, `persistLastUsedSlot`, `readLastUsedSlot`, `getSlotCount` |
| `@engine/sdk/v1/hooks/assets`       | `useManagedTexture`, `useCharacterPortrait`, `useAssetScope`                                                                         |
| `@engine/sdk/v1/hooks/resolution`   | `useResolutionPresentation`, `DamagePulse`                                                                                           |
| `@engine/sdk/v1/hooks/panel-modals` | `usePanelModals`                                                                                                                     |
| `@engine/sdk/v1/audio`              | `useAudio`, `resetMusicTracking`, `DEFAULT_CHOICE_SFX`, `musicAssetLabel`                                                            |
| `@engine/sdk/v1/characters`         | `indexCharacters`, `characterBySpeaker`, `characterAccentColor`                                                                      |
| `@engine/sdk/v1/choices`            | `dispatchChoice`, `actionsByItem`, `playerVisibleChoices`                                                                            |
| `@engine/sdk/v1/format`             | `formatRefId`, `relativeTime`, `formatPlaytime`, `activeIntelKeys`                                                                   |
| `@engine/sdk/v1/notifications`      | `collectStateNotifications`                                                                                                          |
| `@engine/sdk/v1/keyboard`           | `isEditableTarget`, `matchesShortcut`, `useNumberKeySelect`                                                                          |
| `@engine/sdk/v1/timing`             | `createUiTiming` + timing types                                                                                                      |
| `@engine/sdk/v1/settings`           | `useAppSettings`, `AppSettings`, `Theme`, `LogLevel`                                                                                 |
| `@engine/sdk/v1/i18n`               | `i18n`, `I18nResources`                                                                                                              |

## When to use each module

Start with `@engine/sdk/v1/boot` for the game manifest and `@engine/sdk/v1/ui/player-app` for
the root player shell. Add the other modules only when your UI needs them:

- Use `@engine/sdk/v1/ui/components` for slot prop types and for composing default slots from
  a custom `GameScreen`.
- Use `@engine/sdk/v1/types` for view data passed into custom UI: choices, text blocks,
  inventory, characters, notifications, rolls, and the full `GameView`.
- Use `@engine/sdk/v1/state/save-load`, `@engine/sdk/v1/ui/modal`, and `@engine/sdk/v1/settings` when
  building custom menus.
- Use `@engine/sdk/v1/audio`, `@engine/sdk/v1/timing`, and `@engine/sdk/v1/notifications` when your
  game customizes presentation timing, sound, or state-change messages.

If you are unsure whether a module is public, prefer the path that starts with
`@engine/sdk/v1/`. That prefix is the signal that the API is meant for game code.
