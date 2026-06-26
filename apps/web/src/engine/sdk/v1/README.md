# `@engine/sdk/v1` - stable public game API

This directory is the **stable surface** game code imports. Think Win32 over syscalls:
the modules here create the surface and forward to the internal engine
(`@engine/lib`, `@engine/hooks`, `@engine/ui`, ...). The internals are the "syscalls" -
they may be refactored, renamed, or rewritten freely.

## The foundation (why this is more than re-exports)

Every public export is a **real adaptation site**, so a future internal change can be
absorbed here without the game noticing:

1. **v1 owns every type name.** Each public type is declared in v1 (today as an alias of
   the internal type, e.g. `export type GameView = Wire.GameView`). That alias is a
   declaration site you can later turn into a frozen, explicit shape.
2. **Every value export is a real wrapper body.** Functions, hooks, and components are
   defined in v1 and _call_ the internal - never bare `export ... from`. The body is where
   translation goes.

Today the bodies forward 1:1 and the type aliases are identity, so v1 is thin and
zero-cost. But the seam is structurally present everywhere. Concretely, if an internal
signature changes:

```ts
// internal: foo(a: number, b: string)  ->  foo(b: StringInput, a: number)
// v1 public signature stays identical; the wrapper absorbs it:
export function foo(a: number, b: string): Result {
  return internalFoo(createStringInput(b), a); // reorder + wrap, hidden from games
}
```

The same applies to component props (translate before render) and hook options/results.

## Contract

- Game code imports **only** from `@engine/sdk/v1/*`. Those names and shapes are stable for
  the lifetime of `v1`.
- Raw `@engine/lib/*`, `@engine/hooks/*`, `@engine/ui/*` still work but are **unstable -
  use at your own risk** (oxlint warns in game projects).
- Every internal change must keep each `v1` export's public signature intact, absorbing
  the difference inside the wrapper here.
- A change that genuinely cannot be absorbed is **breaking**: add `@engine/sdk/v2` next to
  `v1` and keep `v1` forwarding to internals that still satisfy the old contract. Never
  break `v1` in place.

## Conventions

- Plain functions -> explicit forwarding wrappers with restated signatures.
- Generic functions / hooks / components -> wrappers that forward generics; their
  option/result/prop types are owned by v1 (aliased from the internal type, or derived
  with `Parameters` / `ReturnType` / `ComponentProps` where the internal type is not
  named). This keeps the wrapper low-risk - no field-by-field restating - while still
  giving v1 an editable declaration site.
- Types & constants -> v1-owned aliases / const bindings.

## Layout

```
v1/
  types.ts          wire/view types (GameView, TextBlock, RollRecord, ...)
  boot.ts           GameDefinition, WebPlayerOptions, bootGame
  format.ts         formatRefId, relativeTime, formatPlaytime, activeIntelKeys, ...
  characters.ts     indexCharacters, characterBySpeaker, characterAccentColor
  choices.ts        dispatchChoice, actionsByItem, playerVisibleChoices, ...
  keyboard.ts       isEditableTarget, matchesShortcut, useNumberKeySelect
  notifications.ts  collectStateNotifications
  timing.ts         createUiTiming + timing types
  audio.ts          useAudio, resetMusicTracking, DEFAULT_CHOICE_SFX, musicAssetLabel
  settings.ts       useAppSettings, Theme, LogLevel, AppSettings
  i18n.ts           i18n instance, I18nResources
  state/
    save-load.ts    save slots: readAllSlots, clearSlot, persistLastUsedSlot, ...
  hooks/
    assets.ts       useManagedTexture, useCharacterPortrait, useAssetScope
    resolution.ts   useResolutionPresentation + DamagePulse
    panel-modals.ts usePanelModals
  ui/
    player-app.tsx  TextGamePlayerApp + its config/prop types
    components.ts   useTextGameComponents + the component-slot prop contract
    modal.ts        useModal + modal types
    menu.tsx        MenuButton, SettingsPanel
```
