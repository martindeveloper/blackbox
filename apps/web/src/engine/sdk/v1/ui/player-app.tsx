// @engine/sdk/v1/ui/player-app - player application shell (Blackbox engine API v1).
//
// Wrapper component: v1 owns the config/prop types and renders the internal shell, so
// prop translation can be inserted here without changing the public surface.
import { TextGamePlayerApp as TextGamePlayerAppInternal } from "@engine/ui/textGame/TextGamePlayerApp.js";
import type {
  TextGamePlayerAppConfig as TextGamePlayerAppConfigInternal,
  TextGamePlayerHeaderProps as TextGamePlayerHeaderPropsInternal,
  ChapterTransitionProps as ChapterTransitionPropsInternal,
  NewGameConfirmationProps as NewGameConfirmationPropsInternal,
  MenuTransitionProps as MenuTransitionPropsInternal,
  MenuTransitionIntent as MenuTransitionIntentInternal,
  MenuTransitionPhase as MenuTransitionPhaseInternal,
  MenuTransitionTiming as MenuTransitionTimingInternal,
} from "@engine/ui/textGame/TextGamePlayerApp.js";

export type TextGamePlayerAppConfig<FadeKind extends string> =
  TextGamePlayerAppConfigInternal<FadeKind>;
export type TextGamePlayerHeaderProps = TextGamePlayerHeaderPropsInternal;
export type ChapterTransitionProps = ChapterTransitionPropsInternal;
export type NewGameConfirmationProps = NewGameConfirmationPropsInternal;
export type MenuTransitionProps = MenuTransitionPropsInternal;
export type MenuTransitionIntent = MenuTransitionIntentInternal;
export type MenuTransitionPhase = MenuTransitionPhaseInternal;
export type MenuTransitionTiming = MenuTransitionTimingInternal;

export function TextGamePlayerApp<FadeKind extends string>(props: {
  config: TextGamePlayerAppConfig<FadeKind>;
}) {
  return <TextGamePlayerAppInternal config={props.config} />;
}
