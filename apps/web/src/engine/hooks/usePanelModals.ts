import { useCallback, useEffect, useState } from "react";
import { isEditableTarget, matchesShortcut } from "../lib/keyboard.js";
import { useModal, type ModalDescriptor } from "../ui/ModalContext.js";

export interface PanelModalsOptions<Id extends string> {
  panelIds: readonly Id[];
  shortcuts: Partial<Record<Id, string>>;
  primaryPanelId?: Id;
  primaryShortcut?: string;
  createModal: (id: Id, onClose: () => void) => ModalDescriptor;
}

export function usePanelModals<Id extends string>({
  panelIds,
  shortcuts,
  primaryPanelId,
  primaryShortcut,
  createModal,
}: PanelModalsOptions<Id>) {
  const { openModal, closeModal, hasOpenModals } = useModal();
  const [openPanel, setOpenPanel] = useState<Id | null>(null);

  const closePanel = useCallback(
    (id: Id) => {
      setOpenPanel(null);
      closeModal(id);
    },
    [closeModal],
  );

  const openPanelModal = useCallback(
    (id: Id) => {
      for (const other of panelIds) {
        if (other !== id) closeModal(other);
      }
      setOpenPanel(id);
      openModal(createModal(id, () => closePanel(id)));
    },
    [closePanel, createModal, closeModal, openModal], // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    if (!openPanel) return;
    openPanelModal(openPanel);
  }, [openPanel, openPanelModal]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (isEditableTarget(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;

      if (primaryPanelId && primaryShortcut && matchesShortcut(event, primaryShortcut)) {
        if (hasOpenModals()) return;
        event.preventDefault();
        openPanelModal(primaryPanelId);
        return;
      }

      let panel: Id | null = null;
      for (const id of panelIds) {
        const key = shortcuts[id];
        if (key && matchesShortcut(event, key)) {
          panel = id;
          break;
        }
      }

      if (!panel || (hasOpenModals() && !openPanel)) return;
      event.preventDefault();
      openPanelModal(panel);
    }

    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [hasOpenModals, openPanel, openPanelModal, primaryPanelId, primaryShortcut, shortcuts]);

  return { showPanel: openPanelModal };
}
