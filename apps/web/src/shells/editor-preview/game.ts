import type { GameDefinition } from "@engine/sdk/v1/boot.js";
import { App } from "./App.js";
import { en } from "./en.js";

export const game: GameDefinition = {
  id: "editor-preview",
  App,
  i18nResources: { en },
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
