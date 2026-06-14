import type { GameDefinition } from "@engine/boot.js";
import { App } from "./App.js";

export const game: GameDefinition = {
  id: "editor-preview",
  App,
  i18nResources: {},
  player: {
    mobile: {
      requirePortrait: false,
    },
    saves: {
      slots: 1,
    },
    settings: {
      themes: ["dark", "light"],
      defaultTheme: "dark",
      analytics: {
        available: false,
        defaultEnabled: false,
      },
      defaultVolumes: {
        master: 1,
        music: 1,
        sfx: 1,
      },
    },
  },
};
