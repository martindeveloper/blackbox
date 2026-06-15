import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { NodeInspector } from "../node/NodeInspector.js";
import { GlobalDeathNodeInspector } from "../node/GlobalDeathNodeInspector.js";
import { ItemInspector } from "../catalogs/ItemInspector.js";
import { CharacterInspector } from "../catalogs/CharacterInspector.js";
import { CatalogEntryDetail } from "../catalogs/CatalogEntryDetail.js";
import { MetaEntryInspector } from "../catalogs/MetaEntryInspector.js";
import { SnippetInspector } from "../catalogs/SnippetInspector.js";
import { TemplateInspector } from "../catalogs/TemplateInspector.js";
import { ConditionInspector } from "../catalogs/ConditionInspector.js";
import { ToolsInspector } from "../tools/ToolsInspector.js";
import { BuildInspector } from "../builder/BuildInspector.js";
import { ValidationPanel } from "../validation/ValidationPanel.js";
import { MediaInspector } from "../media/MediaInspector.js";
import { PreviewInspector } from "../preview/PreviewInspector.js";
import { EmptyState } from "../ui/EmptyState.js";
import { Panel, PanelBody, PanelHeader } from "../ui/Panel.js";
import { parseMediaCategory } from "../../lib/mediaLibrary.js";
import { Page } from "../../lib/pages.js";
import {
  editorNavigate,
  useActivityView,
  useEditorSearch,
  type ActivityView,
} from "../../lib/routeHelpers.js";

function inspectorTitle(
  activity: ActivityView | null,
  node: string | null,
  globalNode: string | null,
  item: string | null,
  character: string | null,
  key: string | null,
  file: string | null,
  tool: string | null,
  metaEntry: string | null,
  libraryKind: "snippet" | "template" | "condition",
  libraryEntry: string | null,
  t: (k: string) => string,
): string {
  if (activity === "tools") return tool ? t(`tools.${tool}.title`) : t("activity.tools");
  if (activity === "build") return t("activity.build");
  if (activity === "graph" && globalNode === "death") return t("globalDeath.title");
  if (activity === "graph" && node) return node;
  if (activity === "items" && item) return item;
  if (activity === "characters" && character) return character;
  if (activity === "assets" && key) return key;
  if (activity === "meta" && metaEntry) return metaEntry;
  if (activity === "library" && libraryEntry) {
    if (libraryKind === "snippet") return `@${libraryEntry}`;
    return libraryEntry;
  }
  if (activity === "about") return t("activity.about");
  if (activity === "dashboard") return t("activity.dashboard");
  if (activity === "media" && file) {
    const slash = file.lastIndexOf("/");
    return slash === -1 ? file : file.slice(slash + 1);
  }
  if (activity === "preview") return t("preview.stateInspector");
  return t("inspector.header");
}

export function InspectorPanel() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const activity = useActivityView();
  const search = useEditorSearch();

  const title = inspectorTitle(
    activity,
    search.node,
    search.globalNode,
    search.item,
    search.character,
    search.key,
    search.file,
    search.tool,
    search.metaEntry,
    search.libraryKind,
    search.libraryEntry,
    t,
  );

  const onItemDeleted = () =>
    void editorNavigate(navigate, { to: Page.EditorItems, search: { item: null } });
  const onCharacterDeleted = () =>
    void editorNavigate(navigate, { to: Page.EditorCharacters, search: { character: null } });
  const onCatalogEntryDeleted = () =>
    void editorNavigate(navigate, {
      to: Page.EditorAssets,
      search: { category: search.category, key: null },
    });
  const onMediaDeleted = () => {
    const folder = search.folder ?? search.category ?? "textures";
    void editorNavigate(navigate, {
      to: Page.EditorMedia,
      search: { category: parseMediaCategory(folder.split("/")[0]), folder, file: null },
    });
  };

  let body: React.ReactNode = null;
  switch (activity) {
    case "media":
      body = <MediaInspector selectedPath={search.file} onDeleted={onMediaDeleted} />;
      break;
    case "graph":
      body =
        search.globalNode === "death" ? (
          <GlobalDeathNodeInspector />
        ) : search.node ? (
          <NodeInspector chapterId={search.chapter ?? ""} nodeId={search.node} />
        ) : (
          <EmptyState>{t("inspector.selectNode")}</EmptyState>
        );
      break;
    case "items":
      body = search.item ? (
        <ItemInspector itemId={search.item} onDeleted={onItemDeleted} />
      ) : (
        <EmptyState>{t("inspector.selectItem")}</EmptyState>
      );
      break;
    case "characters":
      body = search.character ? (
        <CharacterInspector characterId={search.character} onDeleted={onCharacterDeleted} />
      ) : (
        <EmptyState>{t("inspector.selectCharacter")}</EmptyState>
      );
      break;
    case "assets":
      body = search.key ? (
        <CatalogEntryDetail
          category={search.category}
          assetKey={search.key}
          onDeleted={onCatalogEntryDeleted}
        />
      ) : (
        <EmptyState>{t("inspector.selectAsset")}</EmptyState>
      );
      break;
    case "meta":
      body = search.metaEntry ? (
        <MetaEntryInspector kind={search.metaKind} entryId={search.metaEntry} />
      ) : (
        <EmptyState>{t("meta.selectEntry")}</EmptyState>
      );
      break;
    case "library":
      body = search.libraryEntry ? (
        search.libraryKind === "template" ? (
          <TemplateInspector templateId={search.libraryEntry} />
        ) : search.libraryKind === "condition" ? (
          <ConditionInspector conditionId={search.libraryEntry} />
        ) : (
          <SnippetInspector snippetId={search.libraryEntry} />
        )
      ) : (
        <EmptyState>{t("library.selectEntry")}</EmptyState>
      );
      break;
    case "tools":
      body = <ToolsInspector />;
      break;
    case "build":
      body = <BuildInspector />;
      break;
    case "preview":
      body = <PreviewInspector />;
      break;
    case "about":
      body = <EmptyState>{t("about.inspectorHint")}</EmptyState>;
      break;
    case "dashboard":
      body = <EmptyState>{t("dashboard.inspectorHint")}</EmptyState>;
      break;
  }

  return (
    <Panel>
      <PanelHeader className="flex items-center justify-between gap-2 truncate">
        <span className="truncate font-mono text-[10px] text-primary">{title}</span>
        <span className="shrink-0 text-[8px] font-bold uppercase tracking-widest text-muted-2">
          {activity ? t(`activity.${activity}`) : "—"}
        </span>
      </PanelHeader>
      <PanelBody className="inspector-body p-2">{body}</PanelBody>
      <ValidationPanel />
    </Panel>
  );
}
