import { useTranslation } from "react-i18next";

export function Pitch() {
  const { t } = useTranslation();

  const stats = [
    { value: t("pitch.stat_platforms"), label: t("pitch.stat_platforms_label") },
    { value: t("pitch.stat_rng"), label: t("pitch.stat_rng_label") },
    { value: t("pitch.stat_format"), label: t("pitch.stat_format_label") },
    { value: t("pitch.stat_core"), label: t("pitch.stat_core_label") },
  ];

  return (
    <section className="pitch section">
      <div className="container">
        <div className="pitch-inner">
          <div className="pitch-copy">
            <span className="section-label">{t("pitch.label")}</span>
            <p className="pitch-body">{t("pitch.body")}</p>
          </div>
          <div className="pitch-stats">
            {stats.map((s) => (
              <div key={s.label} className="pitch-stat">
                <span className="pitch-stat-value">{s.value}</span>
                <span className="pitch-stat-label">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
