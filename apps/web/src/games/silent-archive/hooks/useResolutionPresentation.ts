import { useEffect, useMemo, useRef, useState } from "react";
import {
  hpDamageAmount,
  hpRevealDelayMs,
  mergeDisplayStats,
  resolutionPresentationMode,
  shouldDeferHpReveal,
  type DamagePulse,
  type ResolutionPresentationMode,
} from "../lib/resolutionPresentation.js";
import type { RollRecord, UiNotification } from "../../../engine/types/game.js";
import {
  narrativeSequenceMs,
  notificationsSequenceMs,
  resolutionLeadMs,
  resolutionSequenceMs,
} from "../uiConfig.js";

export type SequencePhase = "narrative" | "resolution" | "ready";

export type { DamagePulse };

function hitStrength(damage: number, maxHp: number | null): number {
  const scale = maxHp !== null && maxHp > 0 ? damage / maxHp : damage / 10;
  return Math.max(0.42, Math.min(1, 0.38 + scale * 1.35));
}

interface UseResolutionPresentationOptions {
  nodeId: string;
  resolutionEpoch: number;
  textBlockCount: number;
  authoritativeStats: Record<string, number>;
  baselineStats: Record<string, number>;
  rolls: RollRecord[];
  notifications: UiNotification[];
}

export function useResolutionPresentation({
  nodeId,
  resolutionEpoch,
  textBlockCount,
  authoritativeStats,
  baselineStats,
  rolls,
  notifications,
}: UseResolutionPresentationOptions) {
  const mode = useMemo(
    () => resolutionPresentationMode(rolls, notifications),
    [rolls, notifications],
  );
  const deferHp = useMemo(
    () => shouldDeferHpReveal(baselineStats, authoritativeStats, rolls, notifications),
    [baselineStats, authoritativeStats, rolls, notifications],
  );

  const [sequencePhase, setSequencePhase] = useState<SequencePhase>("ready");
  const [hpCommitted, setHpCommitted] = useState(true);
  const [damagePulse, setDamagePulse] = useState<DamagePulse | null>(null);
  const [narrativeReady, setNarrativeReady] = useState(true);
  const pulseIdRef = useRef(0);

  const epochKey = `${nodeId}:${resolutionEpoch}`;
  const sequenceSnapshotRef = useRef({
    mode,
    deferHp,
    textBlockCount,
    rolls,
    notifications,
    baselineStats,
    authoritativeStats,
  });
  const [trackedEpochKey, setTrackedEpochKey] = useState(epochKey);
  if (trackedEpochKey !== epochKey) {
    setTrackedEpochKey(epochKey);
    sequenceSnapshotRef.current = {
      mode,
      deferHp,
      textBlockCount,
      rolls,
      notifications,
      baselineStats,
      authoritativeStats,
    };
    setSequencePhase("narrative");
    setNarrativeReady(mode !== "dice-first");
    setHpCommitted(!deferHp);
    setDamagePulse(null);
  }

  const displayStats = useMemo(
    () => mergeDisplayStats(authoritativeStats, baselineStats, deferHp && !hpCommitted),
    [authoritativeStats, baselineStats, deferHp, hpCommitted],
  );

  useEffect(() => {
    const {
      mode: sequenceMode,
      deferHp: sequenceDeferHp,
      textBlockCount: sequenceTextBlocks,
      rolls: sequenceRolls,
      notifications: sequenceNotifications,
      baselineStats: sequenceBaseline,
      authoritativeStats: sequenceAuthoritative,
    } = sequenceSnapshotRef.current;

    const timers: ReturnType<typeof setTimeout>[] = [];

    if (sequenceMode === "dice-first") {
      const showResolutionAfterMs = resolutionLeadMs();
      const resolutionMs = resolutionSequenceMs(sequenceNotifications.length, sequenceRolls.length);
      const diceSettleMs = showResolutionAfterMs + resolutionMs;

      timers.push(setTimeout(() => setSequencePhase("resolution"), showResolutionAfterMs));
      timers.push(setTimeout(() => setNarrativeReady(true), diceSettleMs));
      timers.push(
        setTimeout(
          () => setSequencePhase("ready"),
          diceSettleMs + narrativeSequenceMs(sequenceTextBlocks),
        ),
      );
    } else if (sequenceMode === "narrative-first") {
      const narrativeMs = narrativeSequenceMs(sequenceTextBlocks);
      const notificationMs = notificationsSequenceMs(sequenceNotifications.length);

      timers.push(setTimeout(() => setSequencePhase("resolution"), narrativeMs));
      timers.push(setTimeout(() => setSequencePhase("ready"), narrativeMs + notificationMs));
    } else {
      timers.push(
        setTimeout(() => setSequencePhase("ready"), narrativeSequenceMs(sequenceTextBlocks)),
      );
    }

    if (sequenceDeferHp) {
      const damage = hpDamageAmount(sequenceBaseline, sequenceAuthoritative);
      if (damage !== null) {
        const revealMs = hpRevealDelayMs(sequenceRolls, sequenceNotifications, {
          mode: sequenceMode as ResolutionPresentationMode,
          textBlockCount: sequenceTextBlocks,
          resolutionLeadMs: sequenceMode === "dice-first" ? resolutionLeadMs() : 0,
        });
        const maxHp =
          typeof sequenceAuthoritative.max_hp === "number" ? sequenceAuthoritative.max_hp : null;

        timers.push(
          setTimeout(() => {
            setHpCommitted(true);
            pulseIdRef.current += 1;
            setDamagePulse({
              id: pulseIdRef.current,
              strength: hitStrength(damage, maxHp),
            });
          }, revealMs),
        );
      }
    }

    return () => {
      for (const timer of timers) clearTimeout(timer);
    };
  }, [epochKey]);

  return {
    showResolution: sequencePhase !== "narrative",
    showNarrative: narrativeReady,
    showChoices: sequencePhase === "ready",
    displayStats,
    damagePulse,
    clearDamagePulse: () => setDamagePulse(null),
  };
}
