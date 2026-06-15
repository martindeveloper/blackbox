import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { Icon } from "../icons/Icon.js";

interface Props {
  log: string[];
  running: boolean;
}

export function BuildLog({ log, running }: Props) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedToBottom = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && pinnedToBottom.current) el.scrollTop = el.scrollHeight;
  }, [log]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    pinnedToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  };

  return (
    <section className="build-output-shell" aria-live="polite">
      <div className="build-log-header">
        <span className="build-log-label">{t("build.log")}</span>
        <span className="build-log-spacer" />
        {log.length > 0 ? (
          <span className="build-log-count">{t("build.logLines", { count: log.length })}</span>
        ) : null}
      </div>
      <div className="build-log-body" ref={scrollRef} onScroll={onScroll}>
        {log.length === 0 ? (
          <div className="build-log-empty">
            {running ? (
              <>
                <Icon icon={Loader2} size={14} className="build-spin" />
                {t("build.waiting")}
              </>
            ) : (
              t("build.logEmpty")
            )}
          </div>
        ) : (
          <pre className="build-log-pre">{log.join("\n")}</pre>
        )}
      </div>
    </section>
  );
}
