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
      <div className="tools-info">
        <Icon icon={config.icon} size={18} strokeWidth={1.75} />
        <div>
          <h2>{t(config.labelKey)}</h2>
          <p>{t("tools.convert.description")}</p>
        </div>
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
