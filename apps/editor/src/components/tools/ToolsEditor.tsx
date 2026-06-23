import { useTranslation } from "react-i18next";
import { useEditorSearch } from "@/lib/routeHelpers.js";
import { ToolRunnerView } from "./ToolRunnerView.js";
import { TOOL_ITEMS } from "./ToolsSidebar.js";
import { Icon } from "@/components/icons/Icon.js";

export function ToolsEditor() {
  const { t } = useTranslation();
  const { tool } = useEditorSearch();
  const activeTool = tool ?? "linter";
  const config = TOOL_ITEMS.find((item) => item.id === activeTool) ?? TOOL_ITEMS[0]!;

  if (config.id === "convert") {
    return (
      <div className="tools-runner">
        <header className="tools-runner-header">
          <span className="tools-runner-icon">
            <Icon icon={config.icon} size={15} strokeWidth={2} />
          </span>
          <h1 className="tools-runner-title">{t(config.labelKey)}</h1>
          <span className="tools-runner-header-spacer" />
          <span className="tools-status">{t("tools.convert.automatic")}</span>
        </header>
        <section className="tools-output-shell">
          <div className="tools-output-header">
            <span className="tools-output-label">{t("tools.convert.command")}</span>
          </div>
          <div className="tools-output-body">
            <p className="tools-convert-note">{t("tools.convert.description")}</p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <ToolRunnerView
      key={config.id}
      toolId={config.id}
      title={t(config.labelKey)}
      icon={config.icon}
      commandLabel={t(`tools.${config.id}.command`)}
    />
  );
}
