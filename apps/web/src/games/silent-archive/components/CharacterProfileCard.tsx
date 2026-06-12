import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { useManagedTexture } from "../../../engine/hooks/useAssetScope.js";
import { characterAccentColor } from "../lib/characters.js";
import { formatRefId } from "../../../engine/lib/format.js";
import { statAbbrev } from "../lib/vitals.js";
import type { CharacterView } from "../../../engine/types/game.js";

interface CharacterProfileCardProps {
  character: CharacterView;
}

export function CharacterProfileCard({ character }: CharacterProfileCardProps) {
  const { t } = useTranslation();
  const accent = characterAccentColor(character);
  const portrait = useManagedTexture(
    `character:profile:${character.ref_id}`,
    character.portrait?.src,
  );
  const hasPortrait = Boolean(character.portrait);
  const metrics = (character.metrics ?? []).filter((entry) => entry.value !== 0);

  return (
    <div className="subject-file" style={{ "--subject-accent": accent } as CSSProperties}>
      <div className="subject-file-stripe" aria-hidden />
      <div className="subject-file-grid">
        <div
          className={`subject-file-photo${portrait.ready ? "" : " subject-file-photo--pending"}`}
        >
          {hasPortrait && portrait.url ? (
            <img className="subject-file-photo-image" src={portrait.url} alt="" />
          ) : hasPortrait ? null : (
            <span className="subject-file-photo-fallback">{character.name}</span>
          )}
          <span className="subject-file-photo-frame" aria-hidden />
        </div>

        <div className="subject-file-details">
          <div className="subject-file-field">
            <span className="subject-file-label">{t("character.subjectId")}</span>
            <span className="subject-file-value subject-file-value--mono">{character.ref_id}</span>
          </div>

          {character.subtitle ? (
            <div className="subject-file-field subject-file-field--subtitle">
              <span className="subject-file-label">{t("character.classification")}</span>
              <p className="subject-file-subtitle">{character.subtitle}</p>
            </div>
          ) : (
            <div className="subject-file-field subject-file-field--subtitle">
              <span className="subject-file-label">{t("character.classification")}</span>
              <p className="subject-file-subtitle subject-file-subtitle--muted">
                {formatRefId(character.ref_id)}
              </p>
            </div>
          )}

          {metrics.length > 0 ? (
            <div className="subject-file-field subject-file-field--metrics">
              <span className="subject-file-label">{t("character.telemetry")}</span>
              <div className="subject-file-metrics">
                {metrics.map((metric) => (
                  <div key={metric.key} className="subject-file-metric">
                    <span className="subject-file-metric-key">{statAbbrev(metric.key, t)}</span>
                    <span className="subject-file-metric-val">{metric.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="subject-file-footer">
        <span className="subject-file-stamp">{t("character.stamp")}</span>
      </div>
    </div>
  );
}
