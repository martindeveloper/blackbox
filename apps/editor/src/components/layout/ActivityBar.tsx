import {
  BookOpen,
  BookMarked,
  BookCopy,
  LayoutDashboard,
  FolderOpen,
  Info,
  Layers,
  Package,
  Play,
  Rocket,
  SquareTerminal,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { ACTIVITY_PAGES, isActiveEditorPage, type ActivityView } from "@/lib/pages.js";
import { editorNavigate } from "@/lib/routeHelpers.js";
import { Icon } from "@/components/icons/Icon.js";
import { ActivityTab } from "@/components/ui/ActivityTab.js";

const MAIN_ITEMS: { id: ActivityView; labelKey: string; icon: LucideIcon }[] = [
  { id: "dashboard", labelKey: "activity.dashboard", icon: LayoutDashboard },
  { id: "media", labelKey: "activity.media", icon: FolderOpen },
  { id: "scenario", labelKey: "activity.scenario", icon: BookOpen },
  { id: "graph", labelKey: "activity.graph", icon: Workflow },
  { id: "items", labelKey: "activity.items", icon: Package },
  { id: "characters", labelKey: "activity.characters", icon: Users },
  { id: "assets", labelKey: "activity.assets", icon: Layers },
  { id: "meta", labelKey: "activity.meta", icon: BookMarked },
  { id: "library", labelKey: "activity.library", icon: BookCopy },
  { id: "tools", labelKey: "activity.tools", icon: SquareTerminal },
  { id: "build", labelKey: "activity.build", icon: Rocket },
  { id: "preview", labelKey: "activity.preview", icon: Play },
];

const ABOUT_ITEM = { id: "about" as const, labelKey: "activity.about", icon: Info };

export function ActivityBar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const renderTab = (item: { id: ActivityView; labelKey: string; icon: LucideIcon }) => {
    const label = t(item.labelKey);
    const page = ACTIVITY_PAGES[item.id];
    const isActive = isActiveEditorPage(pathname, page);
    return (
      <ActivityTab
        key={item.id}
        title={label}
        aria-label={label}
        aria-current={isActive ? "page" : undefined}
        active={isActive}
        onClick={() =>
          void editorNavigate(navigate, {
            to: page,
            search: item.id === "tools" ? { tool: "linter" } : undefined,
          })
        }
      >
        <Icon icon={item.icon} size={16} />
      </ActivityTab>
    );
  };

  return (
    <div className="activity-bar flex h-full w-[40px] shrink-0 flex-col items-center py-0.5">
      <div className="flex flex-col items-center">{MAIN_ITEMS.map(renderTab)}</div>
      <div className="activity-bar-spacer" aria-hidden />
      {renderTab(ABOUT_ITEM)}
    </div>
  );
}
