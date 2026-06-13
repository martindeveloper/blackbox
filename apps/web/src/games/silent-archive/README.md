# Silent Archive web game

Game-owned presentation for Silent Archive:

- React screens, panels, modals, and icons
- English copy and investigation/archive terminology
- visual theme and complete stylesheet
- keyboard shortcuts, animation timing, and music fades
- character, stat, notification, and resolution presentation

The game configures the engine-owned `TextGamePlayerApp` with Silent Archive audio, timing, header,
transition, and confirmation overrides. Character and notification adapters supply labels, colors,
and stat ordering to otherwise generic engine behavior.

Engine protocol and browser-runtime changes belong in `src/engine/`. Silent Archive may import the
engine, but the engine must not import this directory.
