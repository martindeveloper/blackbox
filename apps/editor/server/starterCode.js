// Custom-code starter — minimal, heavily-commented files that show a developer
// where to go next when they take over the engine's default web UI. These are
// pure content builders (no filesystem); projectScaffold.js writes them to disk
// via bootstrapStarterCode.

export function starterGameTsDoc(gameId) {
  return `// game.ts — the entry point for this project's custom web UI.
//
// Exporting a \`game\` object switches the player away from the engine's built-in
// default interface and into your own React components and styles. Keep it small
// to start: this wires one root component (App) plus a little player config, and
// grows as you add screens under src/components/ and copy under src/i18n/.
//
// Full reference: open the editor's Preview pane and visit /preview-docs.

import type { GameDefinition } from "@engine/boot.js";
import { App } from "./App.js";

export const game: GameDefinition = {
  id: ${JSON.stringify(gameId)},
  App,
  // Game translations merge on top of the engine's defaults. Add your own keys
  // here, or move them into src/i18n/en.ts as the project grows.
  i18nResources: { en: {} },
  player: {
    // Override individual engine screens as you build them, e.g.:
    //   components: { MainMenu, Choices, Narrative },
    saves: { slots: 3 },
    settings: {
      themes: ["dark", "light"],
      defaultTheme: "dark",
    },
  },
};
`;
}

export function starterAppTsxDoc() {
  return `// App.tsx — the root React component for this project.
//
// The engine ships a complete, ready-to-run player in \`TextGamePlayerApp\`. The
// smallest possible custom UI just renders it with a minimal config and lets the
// engine defaults handle the header, boot screen, transitions, and audio.
//
// To take over a piece of the UI, pass an override into \`config\` (Header,
// BootScreen, ChapterTransition, NewGameConfirmation, …) and style it via app.css.

import {
  TextGamePlayerApp,
  type TextGamePlayerAppConfig,
} from "@engine/ui/textGame/TextGamePlayerApp.js";

const config: TextGamePlayerAppConfig<string> = {
  // How per-turn state changes become on-screen notifications. Returning an
  // empty list disables them; build this out to surface damage, items, etc.
  presentation: {
    collectStateNotifications: () => [],
    rollRevealDelayMs: () => 0,
    chapterTransitionMs: 0,
  },
  // Music/SFX timing. The engine plays the default choice sfx on its own.
  audio: {
    musicLoopDelayMs: 0,
    resolveMusicFade: () => ({ fadeIn: 0, fadeOut: 0 }),
  },
  // ↓ Uncomment and implement to replace individual pieces of the UI.
  // Header: (props) => <MyHeader {...props} />,
  // BootScreen: () => <MyBootScreen />,
};

export function App() {
  return <TextGamePlayerApp config={config} />;
}
`;
}

export function starterAppCssDoc() {
  return `/* app.css — the CSS entry point for this project's web UI.
 *
 * Import additional stylesheets from here as the project grows, e.g.:
 *   @import "./styles/theme.css";
 *
 * Web-font declarations (@font-face / @import url(...)) belong in src/fonts.css,
 * which the Blackbox CSS build prepends automatically — not here. */
`;
}

export function starterReadmeDoc() {
  return `# Custom web UI (\`src/\`)

This folder holds the project's optional custom front-end — the React components,
styles, and copy that replace the engine's built-in default player.

- \`game.ts\` — entry point: the \`game\` definition wiring your \`App\` and player config.
- \`App.tsx\` — root component; renders the engine's \`TextGamePlayerApp\`.
- \`app.css\` — global styles (the CSS entry point).
- \`fonts.css\` — web-font declarations (prepended by the CSS build).

Everything here is optional: a project with no \`src/\` runs entirely on the engine
defaults. Add and override pieces as you need them. The editor's Preview pane
serves \`/preview-docs\` with the full component and config reference.

Authored game data — chapters, items, characters, assets — lives in the JSON
files at the project root, not in this folder.
`;
}
