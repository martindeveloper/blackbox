import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/components/icons/Icon.js";

export function RawSection({ rawText, exitCode }: { rawText: string; exitCode?: number }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const label =
    exitCode !== undefined
      ? t("tools.parsed.rawOutputExit", { code: exitCode })
      : t("tools.parsed.rawOutput");
  return (
    <div className={`parsed-raw-section${open ? " parsed-raw-section--open" : ""}`}>
      {open ? (
        <>
          <button
            type="button"
            className="parsed-raw-toggle parsed-raw-toggle--open"
            onClick={() => setOpen((v) => !v)}
          >
            <Icon icon={ChevronRight} size={10} strokeWidth={2.5} />
            {label}
          </button>
          <div className="parsed-raw-output">
            <pre className="parsed-raw-pre">{rawText}</pre>
          </div>
        </>
      ) : (
        <button
          type="button"
          className="parsed-raw-toggle parsed-raw-toggle--collapsed"
          onClick={() => setOpen((v) => !v)}
        >
          <Icon icon={ChevronRight} size={10} strokeWidth={2.5} />
          {label}
        </button>
      )}
    </div>
  );
}
