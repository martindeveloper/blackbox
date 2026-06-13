import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { GameView } from "../../../engine/types/game.js";
import { statAbbrev } from "../lib/vitals.js";

interface VitalsStripProps {
  playerStats: GameView["player_stats"];
  borderColor: string;
  controls?: ReactNode;
}

export function VitalsStrip({ playerStats, borderColor, controls }: VitalsStripProps) {
  const { t } = useTranslation();
  const allStats = Object.entries(playerStats ?? {});
  const hpVal = allStats.find(([k]) => k === "hp")?.[1];
  const maxHpVal = allStats.find(([k]) => k === "max_hp")?.[1];
  const coreStats = allStats.filter(([k]) => k !== "hp" && k !== "max_hp");
  const isLowHp = typeof hpVal === "number" && hpVal <= 3;
  const hpRatio =
    typeof hpVal === "number" && typeof maxHpVal === "number"
      ? Math.max(0, Math.min(1, hpVal / maxHpVal))
      : null;

  if (!coreStats.length && hpVal === undefined && !controls) return null;

  return (
    <div
      className="vitals-command-line flex-shrink-0 border-b px-4 sm:px-8 py-1.5"
      style={{ borderColor, background: "var(--vitals-bg)" }}
    >
      <div className="vitals-bank">
        {(coreStats.length > 0 || hpVal !== undefined) && (
          <div className="vitals-gauge-row">
            {coreStats.map(([key, val]) => (
              <div key={key} className="stat-gauge">
                <div className="stat-gauge-val">{String(val)}</div>
                <div className="stat-gauge-key">{statAbbrev(key, t)}</div>
              </div>
            ))}

            {hpVal !== undefined && (
              <div className={`stat-gauge stat-gauge--hp${isLowHp ? " stat-gauge--low" : ""}`}>
                <div className="stat-gauge-val">
                  {String(hpVal)}
                  {maxHpVal !== undefined && (
                    <span className="stat-gauge-frac">/{String(maxHpVal)}</span>
                  )}
                </div>
                {hpRatio !== null && (
                  <div className="stat-gauge-bar">
                    <div
                      className="stat-gauge-bar-fill"
                      style={{ width: `${Math.round(hpRatio * 100)}%` }}
                    />
                  </div>
                )}
                <div className="stat-gauge-key">{t("vitals.hp")}</div>
              </div>
            )}
          </div>
        )}
      </div>

      {controls && <div className="vitals-command-bank">{controls}</div>}
    </div>
  );
}
