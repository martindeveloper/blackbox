import type { Dispatch, RefObject, SetStateAction } from "react";
import type { GameView, RollRecord, UiNotification } from "../../types/game.js";
import type { SessionPhase, SessionPresentationAdapter } from "./types.js";

export interface CommitSessionViewParams {
  previousView: GameView;
  nextView: GameView;
  presentation: SessionPresentationAdapter;
  notificationIdRef: RefObject<number>;
  setPresentationBaselineStats: Dispatch<SetStateAction<Record<string, number>>>;
  setPresentationLocation: Dispatch<SetStateAction<string | undefined>>;
  setResolutionEpoch: Dispatch<SetStateAction<number>>;
  setSession: Dispatch<SetStateAction<SessionPhase>>;
  setNotifications: Dispatch<SetStateAction<UiNotification[]>>;
  /** Dev console always animates; command results only when rolls or notifications exist. */
  alwaysAnimatePresentation: boolean;
  /** Command results merge prior notifications unless the node changed; dev console replaces. */
  mergeNotifications: boolean;
  rolls?: RollRecord[];
}

export function commitSessionView({
  previousView,
  nextView,
  presentation,
  notificationIdRef,
  setPresentationBaselineStats,
  setPresentationLocation,
  setResolutionEpoch,
  setSession,
  setNotifications,
  alwaysAnimatePresentation,
  mergeNotifications,
  rolls = [],
}: CommitSessionViewParams): { nodeChanged: boolean } {
  setPresentationBaselineStats({ ...previousView.player_stats });

  const nextNotifications = presentation.collectStateNotifications(previousView, nextView, () => {
    notificationIdRef.current += 1;
    return notificationIdRef.current;
  });

  const nodeChanged = previousView.node_id !== nextView.node_id;
  const shouldAnimate =
    alwaysAnimatePresentation || rolls.length > 0 || nextNotifications.length > 0;

  if (shouldAnimate) {
    setPresentationLocation(previousView.title ?? previousView.node_id);
    setResolutionEpoch((epoch) => epoch + 1);
  } else if (!alwaysAnimatePresentation) {
    setPresentationLocation(undefined);
  }

  setSession((prev) => {
    if (prev.phase !== "ready") return prev;
    return { ...prev, view: nextView };
  });

  if (mergeNotifications) {
    setNotifications((current) => [...(nodeChanged ? [] : current), ...nextNotifications]);
  } else {
    setNotifications(nextNotifications);
  }

  return { nodeChanged };
}
