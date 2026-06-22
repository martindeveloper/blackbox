import { useTranslation } from "react-i18next";
import { useEditorSearch } from "@/lib/routeHelpers.js";
import { ToolRunnerView } from "./ToolRunnerView.js";
import { TOOL_ITEMS } from "./ToolsSidebar.js";

export function ToolsEditor() {
  const { t } = useTranslation();
  const { tool } = useEditorSearch();
  const activeTool = tool ?? "linter";
  const config = TOOL_ITEMS.find((item) => item.id === activeTool) ?? TOOL_ITEMS[0]!;

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
