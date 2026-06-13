import type { GameDefinition } from "../../engine/boot.js";
import { App } from "./App.js";
import { ChoiceList } from "./components/ChoiceList.js";
import { InventoryPanel } from "./components/InventoryPanel.js";
import { JournalPanel } from "./components/JournalPanel.js";
import { MainMenu } from "./components/MainMenu.js";
import { MemoryPanel } from "./components/MemoryPanel.js";
import { NarrativeBlock } from "./components/NarrativeBlock.js";
import { ResolutionLog } from "./components/ResolutionLog.js";
import { GamePanel } from "./components/GamePanel.js";
import { SystemMenu } from "./components/SystemMenu.js";
import { VitalsStrip } from "./components/VitalsStrip.js";
import { en } from "./i18n/en.js";

export const game: GameDefinition = {
  id: "silent-archive",
  App,
  i18nResources: { en },
  player: {
    components: {
      MainMenu,
      GameScreen: GamePanel,
      SystemMenu,
      Choices: ChoiceList,
      Narrative: NarrativeBlock,
      Resolution: ResolutionLog,
      Vitals: VitalsStrip,
      Inventory: InventoryPanel,
      Intel: MemoryPanel,
      Journal: JournalPanel,
    },
    mobile: {
      requirePortrait: true,
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
  },
};
