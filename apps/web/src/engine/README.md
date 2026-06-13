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
export const webPlayerOptions: WebPlayerOptions = {
  disableLandscapeModeOnMobile: true,
};
```

This directory must not import from `src/games/`. Game-specific presentation behavior is supplied
to reusable hooks through adapters such as `SessionPresentationAdapter`.
