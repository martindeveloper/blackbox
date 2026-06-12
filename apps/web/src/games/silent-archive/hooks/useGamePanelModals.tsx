import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArchiveIcon, GridIcon, IncidentIcon } from "../components/Icons.js";
import { InventoryPanel } from "../components/InventoryPanel.js";
import { JournalPanel } from "../components/JournalPanel.js";
import { MemoryPanel } from "../components/MemoryPanel.js";
import { SystemMenu } from "../components/SystemMenu.js";
import { type ModalDescriptor, useModal } from "../context/ModalContext.js";
import { isEditableTarget, matchesShortcut } from "../../../engine/lib/keyboard.js";
import type { GameView, ItemExamineView } from "../../../engine/types/game.js";
import { UI_SHORTCUTS } from "../uiConfig.js";

type GamePanelId = "inventory" | "memory" | "journal" | "system";

const ALL_PANELS: GamePanelId[] = ["inventory", "memory", "journal", "system"];

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
  const { openModal, closeModal, hasOpenModals } = useModal();
  const [openPanel, setOpenPanel] = useState<GamePanelId | null>(null);

  const closePanel = useCallback(
    (id: GamePanelId) => {
      setOpenPanel(null);
      closeModal(id);
    },
    [closeModal],
  );

  const closeOtherPanels = useCallback(
    (except: GamePanelId) => {
      for (const id of ALL_PANELS) {
        if (id !== except) closeModal(id);
      }
    },
    [closeModal],
  );

  const openPanelModal = useCallback(
    (id: GamePanelId) => {
      closeOtherPanels(id);
      setOpenPanel(id);
      openModal(createGamePanelModal(id, ctx, t, () => closePanel(id)));
    },
    [closeOtherPanels, closePanel, ctx, openModal, t],
  );

  useEffect(() => {
    if (!openPanel) return;
    openPanelModal(openPanel);
  }, [
    openPanel,
    ctx.examine,
    ctx.commandPending,
    ctx.view.inventory_items,
    ctx.view.item_actions,
    ctx.view.events,
    ctx.memoryKeys,
    ctx.isTerminal,
    openPanelModal,
  ]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (isEditableTarget(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;

      if (matchesShortcut(event, UI_SHORTCUTS.system.key)) {
        if (hasOpenModals()) return;
        event.preventDefault();
        openPanelModal("system");
        return;
      }

      const panel = matchesShortcut(event, UI_SHORTCUTS.inventory.key)
        ? "inventory"
        : matchesShortcut(event, UI_SHORTCUTS.intel.key)
          ? "memory"
          : matchesShortcut(event, UI_SHORTCUTS.journal.key)
            ? "journal"
            : null;

      if (!panel || (hasOpenModals() && !openPanel)) return;
      event.preventDefault();
      openPanelModal(panel);
    }

    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [hasOpenModals, openPanel, openPanelModal]);

  return { showPanel: openPanelModal };
}
