import { Activity, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { usePreviewStore } from "../../store/usePreviewStore.js";
import { Icon } from "../icons/Icon.js";
import { Panel, PanelBody, PanelHeader } from "../ui/Panel.js";
import { PreviewInspectorProfiler } from "./PreviewInspectorProfiler.js";

export function PreviewEventsSidebar() {
  const { t } = useTranslation();
  const events = usePreviewStore((state) => state.profilerEvents);
  const commandSender = usePreviewStore((state) => state.commandSender);

  return (
    <Panel className="preview-events-sidebar">
      <PanelHeader className="preview-events-header">
        <span>
          <Icon icon={Activity} size={12} />
          {t("preview.profiler")}
        </span>
        <span className="preview-events-header-actions">
          <em>{events.length}</em>
          <button
            type="button"
            disabled={!events.length}
            title={t("preview.clearProfiler")}
            aria-label={t("preview.clearProfiler")}
            onClick={() => commandSender?.({ type: "clear-profiler" })}
          >
            <Icon icon={Trash2} size={11} />
          </button>
        </span>
      </PanelHeader>
      <PanelBody className="flex min-h-0 flex-col">
        <PreviewInspectorProfiler dock showHeader={false} />
      </PanelBody>
    </Panel>
  );
}
