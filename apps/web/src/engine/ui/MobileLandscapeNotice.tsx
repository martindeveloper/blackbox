import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getWebPlayerOptions } from "../lib/playerConfig.js";

function isPhoneLandscape(): boolean {
  const { requirePortrait, maxShortEdgePx } = getWebPlayerOptions().mobile;
  if (!requirePortrait) return false;

  const orientation = window.matchMedia("(orientation: landscape)").matches;
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const touchCapable = navigator.maxTouchPoints > 0;
  const shortScreenEdge = Math.min(window.screen.width, window.screen.height);

  return orientation && shortScreenEdge <= maxShortEdgePx && (coarsePointer || touchCapable);
}

export function MobileLandscapeNotice() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(isPhoneLandscape);

  useEffect(() => {
    const orientationQuery = window.matchMedia("(orientation: landscape)");
    const updateVisibility = () => setVisible(isPhoneLandscape());

    orientationQuery.addEventListener("change", updateVisibility);
    window.addEventListener("resize", updateVisibility);
    window.addEventListener("orientationchange", updateVisibility);
    window.visualViewport?.addEventListener("resize", updateVisibility);

    return () => {
      orientationQuery.removeEventListener("change", updateVisibility);
      window.removeEventListener("resize", updateVisibility);
      window.removeEventListener("orientationchange", updateVisibility);
      window.visualViewport?.removeEventListener("resize", updateVisibility);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className="mobile-landscape-notice"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="mobile-landscape-title"
      aria-describedby="mobile-landscape-description"
    >
      <div className="mobile-landscape-grid" aria-hidden="true" />
      <div className="mobile-landscape-card">
        <div className="mobile-landscape-kicker">{t("orientation.kicker")}</div>
        <div className="mobile-landscape-device" aria-hidden="true">
          <span className="mobile-landscape-device-speaker" />
          <span className="mobile-landscape-device-screen">
            <span className="mobile-landscape-rotate-arrow">&#8635;</span>
          </span>
        </div>
        <h2 id="mobile-landscape-title">{t("orientation.title")}</h2>
        <p id="mobile-landscape-description">{t("orientation.description")}</p>
        <div className="mobile-landscape-status" aria-hidden="true">
          <span />
          {t("orientation.status")}
        </div>
      </div>
    </div>
  );
}
