import type { GameDefinition, WebPlayerOptions } from "../../engine/boot.js";
import { App } from "./App.js";
import { en } from "./i18n/en.js";

export const webPlayerOptions: WebPlayerOptions = {
  disableLandscapeModeOnMobile: true,
};

export const game: GameDefinition = {
  id: "silent-archive",
  App,
  i18nResources: { en },
};
