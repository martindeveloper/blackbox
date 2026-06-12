import { type CSSProperties } from "react";
import type { DamagePulse } from "../../../engine/lib/resolutionPresentation.js";

interface HpSnapshot {
  hp: number;
  maxHp: number | null;
  ratio: number | null;
}

function readHp(playerStats: Record<string, number>): HpSnapshot | null {
  const hp = playerStats.hp;
  if (typeof hp !== "number") return null;

  const maxHp = typeof playerStats.max_hp === "number" ? playerStats.max_hp : null;
  const ratio = maxHp !== null && maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : null;

  return { hp, maxHp, ratio };
}

function isCriticalHp({ hp, ratio }: HpSnapshot): boolean {
  if (hp <= 3) return true;
  return ratio !== null && ratio <= 0.35;
}

function criticalIntensity({ hp, ratio }: HpSnapshot): number {
  const ratioStress = ratio !== null ? 1 - ratio : hp <= 3 ? 0.65 : 0;
  const absoluteStress = hp <= 1 ? 1 : hp <= 2 ? 0.88 : hp <= 3 ? 0.72 : 0;
  return Math.max(0.38, Math.min(1, Math.max(ratioStress, absoluteStress)));
}

interface DamageVignetteProps {
  playerStats: Record<string, number>;
  damagePulse?: DamagePulse | null;
  onDamagePulseEnd?: (pulseId: number) => void;
}

export function DamageVignette({
  playerStats,
  damagePulse = null,
  onDamagePulseEnd,
}: DamageVignetteProps) {
  const snapshot = readHp(playerStats);
  if (!snapshot) return null;

  const critical = isCriticalHp(snapshot);
  const intensity = criticalIntensity(snapshot);

  return (
    <div className="damage-vignette-stack" aria-hidden>
      {critical && (
        <div
          className="damage-vignette damage-vignette--critical"
          style={
            {
              "--damage-intensity": intensity.toFixed(3),
            } as CSSProperties
          }
        />
      )}

      {damagePulse && (
        <div
          key={damagePulse.id}
          className="damage-vignette damage-vignette--hit"
          style={
            {
              "--damage-hit-strength": damagePulse.strength.toFixed(3),
            } as CSSProperties
          }
          onAnimationEnd={() => onDamagePulseEnd?.(damagePulse.id)}
        />
      )}
    </div>
  );
}
