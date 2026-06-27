import { usePanelModals as usePanelModalsInternal } from "@engine/hooks/usePanelModals.js";
import type { PanelModalsOptions as PanelModalsOptionsInternal } from "@engine/hooks/usePanelModals.js";

export type PanelModalsOptions<Id extends string> = PanelModalsOptionsInternal<Id>;

export function usePanelModals<Id extends string>(
  options: PanelModalsOptions<Id>,
): { showPanel: (id: Id) => void } {
  return usePanelModalsInternal<Id>(options);
}
