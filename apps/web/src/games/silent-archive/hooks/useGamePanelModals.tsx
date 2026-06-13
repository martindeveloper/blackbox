import { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ArchiveIcon, GridIcon, IncidentIcon } from "../components/Icons.js";
import { usePanelModals } from "../../../engine/hooks/usePanelModals.js";
import type { ModalDescriptor } from "../../../engine/ui/ModalContext.js";
import type { GameView, ItemExamineView } from "../../../engine/types/game.js";
import {
  useTextGameComponents,
  type TextGameComponents,
} from "../../../engine/ui/textGame/TextGamePresentation.js";
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

interface PanelTarget {
  itemRef?: string;
  intelRef?: string;
}

function createGamePanelModal(
  id: GamePanelId,
  ctx: GamePanelModalContext,
  components: TextGameComponents,
  t: (key: string) => string,
  onClose: () => void,
  target: PanelTarget,
): ModalDescriptor {
  const shared = { id, size: "lg" as const, onClose };

  switch (id) {
    case "inventory": {
      const Inventory = components.Inventory;
      return {
        ...shared,
        title: t("inventory.title"),
        eyebrow: t("inventory.eyebrow"),
        icon: <GridIcon size={12} />,
        tone: "green",
        children: (
          <Inventory
            key={target.itemRef ?? "default"}
            view={ctx.view}
            examine={ctx.examine}
            commandPending={ctx.commandPending}
            initialItemRef={target.itemRef}
            onExamine={ctx.onExamine}
            onUse={ctx.onUseItem}
          />
        ),
      };
    }
    case "memory": {
      const Intel = components.Intel;
      return {
        ...shared,
        title: t("memory.title"),
        eyebrow: t("memory.eyebrow"),
        icon: <ArchiveIcon size={14} />,
        tone: "cyan",
        children: (
          <Intel memories={ctx.memoryKeys} meta={ctx.view.meta} initialIntelRef={target.intelRef} />
        ),
      };
    }
    case "journal": {
      const Journal = components.Journal;
      return {
        ...shared,
        title: t("journal.title"),
        eyebrow: t("journal.eyebrow"),
        icon: <IncidentIcon size={12} />,
        tone: "copper",
        children: <Journal events={ctx.view.events} meta={ctx.view.meta} />,
      };
    }
    case "system": {
      const SystemMenu = components.SystemMenu;
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
}

export function useGamePanelModals(ctx: GamePanelModalContext) {
  const { t } = useTranslation();
  const components = useTextGameComponents();
  const targetRef = useRef<PanelTarget>({});

  const createModal = useCallback(
    (id: GamePanelId, onClose: () => void) =>
      createGamePanelModal(
        id,
        ctx,
        components,
        t,
        () => {
          targetRef.current = {};
          onClose();
        },
        targetRef.current,
      ),
    [
      t,
      components,
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

  const { showPanel: showPanelModal } = usePanelModals({
    panelIds: ALL_PANELS,
    shortcuts: PANEL_SHORTCUTS,
    primaryPanelId: "system",
    primaryShortcut: UI_SHORTCUTS.system.key,
    createModal,
  });

  const showPanel = useCallback(
    (id: GamePanelId) => {
      targetRef.current = {};
      showPanelModal(id);
    },
    [showPanelModal],
  );

  const showInventoryItem = useCallback(
    (itemRef: string) => {
      targetRef.current = { itemRef };
      showPanelModal("inventory");
    },
    [showPanelModal],
  );

  const showIntel = useCallback(
    (intelRef: string) => {
      targetRef.current = { intelRef };
      showPanelModal("memory");
    },
    [showPanelModal],
  );

  return { showPanel, showInventoryItem, showIntel };
}
