import { useTranslation } from "react-i18next";
import { EDITOR_VERSION } from "@/lib/version.js";

export function EditorFooter() {
  const { t } = useTranslation();

  return (
    <footer className="editor-footer">
      <blockquote className="editor-footer-quote" cite="Roy Batty">
        <q>{t("footer.quote")}</q>
        <cite>{t("footer.author")}</cite>
      </blockquote>
      <span className="editor-footer-version">v{EDITOR_VERSION}</span>
    </footer>
  );
}
