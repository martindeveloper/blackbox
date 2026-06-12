import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ArchiveIcon, GridIcon, IncidentIcon } from "../components/Icons.js";
import { InventoryPanel } from "../components/InventoryPanel.js";
import { JournalPanel } from "../components/JournalPanel.js";
import { MemoryPanel } from "../components/MemoryPanel.js";
import { SystemMenu } from "../components/SystemMenu.js";
import { usePanelModals } from "../../../engine/hooks/usePanelModals.js";
import type { ModalDescriptor } from "../../../engine/ui/ModalContext.js";
import type { GameView, ItemExamineView } from "../../../engine/types/game.js";
import { UI_SHORTCUTS } from "../uiConfig.js";

type GamePanelId = "inventory" | "memory" | "journal" | "system";

const ALL_PANELS: readonly GamePanelId[] = ["inventory", "memory", "journal", "system"];

const PANEL_SHORTCUTS: Partial<Record<GamePanelId, string>> = {
  inventory: UI_SHORTCUTS.inventory.key,
  memory: UI_SHORTCUTS.intel.key,
  journal: UI_SHORTCUTS.journal.key,
};

interface GamePanelModalContext {
  view: GameView;
  memoryKeys: string[];
  isTerminal: boolean;
  examine: ItemExamineView | null;
  commandPending: boolean;
  onExamine: (itemRef: string) => void;
  onUseItem: (itemRef: string, actionId: string) => void;
  onSave: () => void;
  onOpenMainMenu: () => void;
  onRestart: () => void;
  onCreateSupportBundle: () => void;
}

function createGamePanelModal(
  id: GamePanelId,
  ctx: GamePanelModalContext,
  t: (key: string) => string,
  onClose: () => void,
): ModalDescriptor {
  const shared = { id, size: "lg" as const, onClose };

  switch (id) {
    case "inventory":
      return {
        ...shared,
        title: t("inventory.title"),
        eyebrow: t("inventory.eyebrow"),
        icon: <GridIcon size={12} />,
        tone: "green",
        children: (
          <InventoryPanel
            view={ctx.view}
            examine={ctx.examine}
            commandPending={ctx.commandPending}
            onExamine={ctx.onExamine}
            onUse={ctx.onUseItem}
          />
        ),
      };
    case "memory":
      return {
        ...shared,
        title: t("memory.title"),
        eyebrow: t("memory.eyebrow"),
        icon: <ArchiveIcon size={14} />,
        tone: "cyan",
        children: <MemoryPanel memories={ctx.memoryKeys} meta={ctx.view.meta} />,
      };
    case "journal":
      return {
        ...shared,
        title: t("journal.title"),
        eyebrow: t("journal.eyebrow"),
        icon: <IncidentIcon size={12} />,
        tone: "copper",
        children: <JournalPanel events={ctx.view.events} meta={ctx.view.meta} />,
      };
    case "system":
      return {
        id,
        size: "md",
        onClose,
        title: t("menu.title"),
        eyebrow: t("menu.eyebrow"),
        icon: <GridIcon size={12} />,
        tone: "amber",
        children: (
          <SystemMenu
            isTerminal={ctx.isTerminal}
            onSave={() => {
              ctx.onSave();
              onClose();
            }}
            onOpenMainMenu={() => {
              ctx.onOpenMainMenu();
              onClose();
            }}
            onRestart={() => {
              ctx.onRestart();
              onClose();
            }}
            onCreateSupportBundle={ctx.onCreateSupportBundle}
          />
        ),
      };
  }
}

export function useGamePanelModals(ctx: GamePanelModalContext) {
  const { t } = useTranslation();

  const createModal = useCallback(
    (id: GamePanelId, onClose: () => void) => createGamePanelModal(id, ctx, t, onClose),
    [
      t,
      ctx.examine,
      ctx.commandPending,
      ctx.view,
      ctx.memoryKeys,
      ctx.isTerminal,
      ctx.onExamine,
      ctx.onUseItem,
      ctx.onSave,
      ctx.onOpenMainMenu,
      ctx.onRestart,
      ctx.onCreateSupportBundle,
    ],
  );

  return usePanelModals({
    panelIds: ALL_PANELS,
    shortcuts: PANEL_SHORTCUTS,
    primaryPanelId: "system",
    primaryShortcut: UI_SHORTCUTS.system.key,
    createModal,
  });
}
