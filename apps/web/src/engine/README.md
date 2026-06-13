# Web engine

Reusable browser host code for Blackbox games:

- WASM and command protocol adapters
- bundle loading and asset lifetime management
- save slots and chapter checkpoints
- audio engine and persisted player settings
- configurable React audio lifecycle and iOS recovery hook
- session lifecycle, recovery, logging, and diagnostics
- character indexing, stat deltas, and `GameView` notification diffing
- engine wire and view types

Games configure player-owned behavior in their `game.ts` manifest:

```ts
export const game: GameDefinition = {
  id: "example",
  App,
  i18nResources: { en },
  player: {
    mobile: {
      requirePortrait: true,
      maxShortEdgePx: 500,
    },
    saves: {
      slots: 3,
    },
    settings: {
      themes: ["dark", "light"],
      defaultTheme: "dark",
      analytics: {
        available: true,
        defaultEnabled: true,
      },
      defaultVolumes: {
        master: 1,
        music: 1,
        sfx: 0.7,
      },
    },
    assets: {
      fallbackPortrait: "textures/characters/generic.png",
      fallbackBackground: "textures/backgrounds/generic.png",
    },
    components: {
      MainMenu: CustomMainMenu,
      GameScreen: CustomGameScreen,
      SystemMenu: CustomSystemMenu,
      Choices: CustomChoices,
      Narrative: CustomNarrative,
      Resolution: CustomResolution,
      Vitals: CustomVitals,
      Inventory: CustomInventory,
      Intel: CustomIntel,
      Journal: CustomJournal,
    },
  },
};
```

All options are optional. Player persistence is automatically namespaced by `game.id`; legacy
single-game `blackbox_*` keys are migrated when first read.

The engine supplies usable default implementations for every component in `player.components`,
including the main menu and full game screen. Games normally customize them through CSS and
translation overrides. Supplying a component replaces only that presentation slot while preserving
the engine session, save, command, and modal behavior. A game can therefore begin with no component
overrides, replace individual panels, or replace the entire playable screen.

`TextGamePlayerApp` is the matching application shell. It owns the standard session, audio, save,
restart, support-bundle, keyboard, and phase-routing behavior. A game passes small presentation and
audio adapters, then may override its header, boot screen, chapter transition, confirmation content,
or any component in `player.components`. This keeps the normal path small without imposing a fixed
layout:

```tsx
const playerConfig: TextGamePlayerAppConfig<MyFadeKind> = {
  presentation: {
    collectStateNotifications,
    rollRevealDelayMs: (rollCount) => 800 + rollCount * 300,
    chapterTransitionMs: 1800,
  },
  audio: {
    defaultSfx: DEFAULT_CHOICE_SFX,
    resolveMusicFade,
  },
  Header: MedievalHeader,
};

export function App() {
  return <TextGamePlayerApp config={playerConfig} />;
}
```

Replacing `GameScreen` gives a game complete control over its playable UI. Replacing smaller slots
retains the default shell and swaps only the relevant capability.

This directory must not import from `src/games/`. Game-specific presentation behavior is supplied
to reusable hooks through adapters such as `SessionPresentationAdapter`.
