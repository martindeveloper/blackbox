import { useTranslation } from "react-i18next";
import { LogoMark } from "./LogoMark";

function FooterWordmark({
  className = "",
  black,
  box,
}: {
  className?: string;
  black: string;
  box: string;
}) {
  return (
    <span className={`footer-wordmark ${className}`.trim()}>
      <span className="footer-wordmark-black">{black}</span>
      <span className="footer-wordmark-box">{box}</span>
    </span>
  );
}

export function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <div className="footer-brand">
          <LogoMark className="footer-logo-mark" />
          <FooterWordmark black={t("brand.wordmark_black")} box={t("brand.wordmark_box")} />
          <span className="footer-tagline">{t("footer.tagline")}</span>
        </div>
        <span className="footer-copy">{t("footer.copyright")}</span>
      </div>
    </footer>
  );
}
