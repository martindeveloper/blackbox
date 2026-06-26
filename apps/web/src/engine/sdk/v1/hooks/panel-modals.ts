// @engine/sdk/v1/hooks/panel-modals - panel-modal hook (Blackbox engine API v1).
import { usePanelModals as usePanelModalsInternal } from "@engine/hooks/usePanelModals.js";
import type { PanelModalsOptions as PanelModalsOptionsInternal } from "@engine/hooks/usePanelModals.js";

export type PanelModalsOptions<Id extends string> = PanelModalsOptionsInternal<Id>;

export function usePanelModals<Id extends string>(
  options: PanelModalsOptions<Id>,
): { showPanel: (id: Id) => void } {
  return usePanelModalsInternal<Id>(options);
}
