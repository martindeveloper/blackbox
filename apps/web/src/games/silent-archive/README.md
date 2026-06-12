# Silent Archive web game

Game-owned presentation for Silent Archive:

- React screens, panels, modals, and icons
- English copy and investigation/archive terminology
- visual theme and complete stylesheet
- keyboard shortcuts, animation timing, and music fades
- character, stat, notification, and resolution presentation

Thin wrappers in `hooks/useAudio.ts`, `lib/characters.ts`, and `lib/notifications.ts` configure
generic engine behavior with Silent Archive fades, labels, colors, and stat ordering.

Engine protocol and browser-runtime changes belong in `src/engine/`. Silent Archive may import the
engine, but the engine must not import this directory.
