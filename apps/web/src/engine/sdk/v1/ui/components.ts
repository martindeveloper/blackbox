// @engine/sdk/v1/ui/components - component-slot contract (Blackbox engine API v1).
//
// The presentation-slot system: games provide components for these slots via the game
// manifest, and a custom GameScreen pulls sibling slots back via useTextGameComponents.
// v1 owns the prop types that define each slot's contract.
import { useTextGameComponents as useTextGameComponentsInternal } from "@engine/ui/textGame/TextGamePresentation.js";
import type * as Slots from "@engine/ui/textGame/types.js";

export type ChoicesProps = Slots.ChoicesProps;
export type NarrativeProps = Slots.NarrativeProps;
export type ResolutionProps = Slots.ResolutionProps;
export type VitalsProps = Slots.VitalsProps;
export type InventoryProps = Slots.InventoryProps;
export type IntelProps = Slots.IntelProps;
export type JournalProps = Slots.JournalProps;
export type MainMenuProps = Slots.MainMenuProps;
export type SystemMenuProps = Slots.SystemMenuProps;
export type GameScreenProps = Slots.GameScreenProps;
export type TextGameComponents = Slots.TextGameComponents;
export type TextGameComponentOverrides = Slots.TextGameComponentOverrides;

export function useTextGameComponents(): TextGameComponents {
  return useTextGameComponentsInternal();
}
