import { Code2, Layers, Plus, Quote, Skull, Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { Icon } from "../icons/Icon.js";
import { ListItem } from "../ui/ListItem.js";
import { Input } from "../ui/Input.js";
import { Panel, PanelBody, PanelHeader } from "../ui/Panel.js";
import { CatalogSidebar } from "../catalogs/CatalogSidebar.js";
import { MetaCatalogSidebar } from "../catalogs/MetaCatalogSidebar.js";
import { LibrarySidebar } from "../catalogs/LibrarySidebar.js";
import { entriesForCategory } from "../../lib/catalogHealth.js";
import { collectSnippetIdsFromText } from "../../lib/libraryRefs.js";
import { Page } from "../../lib/pages.js";
import {
  editorNavigate,
  navigateToCatalogEntry,
  useActivityView,
  useEditorSearch,
} from "../../lib/routeHelpers.js";
import { parseMediaCategory } from "../../lib/mediaLibrary.js";
import { useScenarioStore } from "../../store/useScenarioStore.js";
import { Button } from "../ui/Button.js";

export function FileTree() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const activity = useActivityView();
  const search = useEditorSearch();

  const bundle = useScenarioStore((s) => s.bundle);
  const projectCodeTrusted = useScenarioStore((s) => s.projectCodeTrusted);
  const projectHasCustomCode = useScenarioStore((s) => s.projectHasCustomCode);
  const updateAssets = useScenarioStore((s) => s.updateAssets);
  const addChapter = useScenarioStore((s) => s.addChapter);
  const bootstrapProjectCode = useScenarioStore((s) => s.bootstrapProjectCode);

  const handleAddChapter = () => {
    const created = addChapter();
    if (!created) return;
    void editorNavigate(navigate, {
      to: Page.EditorGraph,
      search: {
        chapter: created.chapterId,
        node: created.startNodeId,
        globalNode: null,
      },
    });
  };

  const selectedCategory = parseMediaCategory(search.category);

  if (!bundle) {
    return (
      <div className="p-3 text-[10px] text-muted-2">
        {t("fileTree.openProjectBrowse", { activity: t(`activity.${activity ?? "media"}`) })}
      </div>
    );
  }

  if (activity === "graph") {
    const chapter = search.chapter ? bundle.chapters[search.chapter] : null;
    const hasGlobalDeath = Boolean(bundle.scenario.deathNode);
    return (
      <Panel>
        <PanelHeader uppercase className="flex items-center justify-between gap-2">
          <span>{t("fileTree.chapters")}</span>
          <Button
            size="sm"
            variant="ghost"
            icon
            leadingIcon={Plus}
            title={t("scenario.addChapter")}
            aria-label={t("scenario.addChapter")}
            onClick={handleAddChapter}
          />
        </PanelHeader>
        <div className="overflow-y-auto border-b border-border">
          {bundle.scenario.chapters.map((ch) => (
            <ListItem
              key={ch.id}
              selected={search.chapter === ch.id}
              onClick={() =>
                void editorNavigate(navigate, {
                  to: Page.EditorGraph,
                  search: { chapter: ch.id, node: null, globalNode: null },
                })
              }
            >
              {ch.title}
            </ListItem>
          ))}
        </div>
        <PanelHeader uppercase>{t("fileTree.nodes")}</PanelHeader>
        <PanelBody>
          {chapter
            ? Object.keys(chapter.nodes)
                .sort()
                .map((nodeId) => {
                  const node = chapter.nodes[nodeId]!;
                  const snippetCount = collectSnippetIdsFromText(node.text).length;
                  return (
                    <ListItem
                      key={nodeId}
                      mono
                      selected={search.node === nodeId}
                      onClick={() =>
                        void editorNavigate(navigate, {
                          to: Page.EditorGraph,
                          search: { chapter: search.chapter, node: nodeId, globalNode: null },
                        })
                      }
                    >
                      <span className="editor-btn-content">
                        {nodeId}
                        {nodeId === chapter.startNodeId ? (
                          <Icon icon={Star} size={10} className="text-success" strokeWidth={2} />
                        ) : null}
                        {nodeId === chapter.deathNodeId ? (
                          <Icon icon={Skull} size={10} className="text-danger" strokeWidth={2} />
                        ) : null}
                        {node.$extends ? (
                          <span title={node.$extends}>
                            <Icon icon={Layers} size={10} className="text-accent" strokeWidth={2} />
                          </span>
                        ) : null}
                        {snippetCount > 0 ? (
                          <span
                            className="file-tree-node-badge"
                            title={t("fileTree.snippetRefs", { count: snippetCount })}
                          >
                            <Icon icon={Quote} size={9} strokeWidth={2} />
                            {snippetCount}
                          </span>
                        ) : null}
                      </span>
                    </ListItem>
                  );
                })
            : null}
        </PanelBody>
        <PanelHeader uppercase>{t("fileTree.global")}</PanelHeader>
        <div>
          <ListItem
            mono
            selected={search.globalNode === "death"}
            onClick={() =>
              void editorNavigate(navigate, {
                to: Page.EditorGraph,
                search: { chapter: search.chapter, node: null, globalNode: "death" },
              })
            }
          >
            <span className="editor-btn-content">
              <Icon icon={Skull} size={10} className="text-danger" strokeWidth={2} />
              {t("fileTree.globalDeath")}
              {!hasGlobalDeath ? (
                <span className="file-tree-node-badge text-muted-2">{t("common.none")}</span>
              ) : null}
            </span>
          </ListItem>
        </div>
      </Panel>
    );
  }

  if (activity === "items") {
    return (
      <Panel>
        <PanelHeader uppercase>{t("fileTree.items")}</PanelHeader>
        <PanelBody>
          {Object.keys(bundle.items.items)
            .sort()
            .map((id) => (
              <ListItem
                key={id}
                selected={search.item === id}
                onClick={() =>
                  void editorNavigate(navigate, { to: Page.EditorItems, search: { item: id } })
                }
              >
                {bundle.items.items[id]?.name ?? id}
              </ListItem>
            ))}
        </PanelBody>
      </Panel>
    );
  }

  if (activity === "characters") {
    const normalizedFilter = search.characterFilter.trim().toLowerCase();
    const visibleCharacters = Object.entries(bundle.characters.characters)
      .sort(([a], [b]) => a.localeCompare(b))
      .filter(([id, character]) => {
        if (!normalizedFilter || search.character === id) return true;
        return [id, character.name, character.portraitRef, character.voiceRef]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(normalizedFilter));
      });

    return (
      <Panel>
        <PanelHeader uppercase>{t("fileTree.characters")}</PanelHeader>
        <div className="catalog-sidebar-filter">
          <Input
            compact
            mono
            type="search"
            value={search.characterFilter}
            placeholder={t("characters.filterPlaceholder")}
            aria-label={t("characters.filterPlaceholder")}
            onChange={(event) =>
              void editorNavigate(navigate, {
                to: Page.EditorCharacters,
                search: {
                  character: search.character,
                  filter: event.target.value || null,
                },
                replace: true,
              })
            }
          />
        </div>
        <PanelBody>
          {visibleCharacters.map(([id, character]) => (
            <ListItem
              key={id}
              selected={search.character === id}
              onClick={() =>
                void editorNavigate(navigate, {
                  to: Page.EditorCharacters,
                  search: { character: id },
                })
              }
            >
              {character.name ?? id}
            </ListItem>
          ))}
          {visibleCharacters.length === 0 ? (
            <p className="catalog-sidebar-filter-empty">{t("characters.filterEmpty")}</p>
          ) : null}
        </PanelBody>
      </Panel>
    );
  }

  if (activity === "assets") {
    const addEntry = () => {
      const id = `new_${Date.now()}`;
      const entry = selectedCategory === "music" ? { src: "", loop: true } : { src: "" };
      updateAssets({
        [selectedCategory]: { ...entriesForCategory(bundle.assets, selectedCategory), [id]: entry },
      });
      void navigateToCatalogEntry(navigate, selectedCategory, id);
    };

    return (
      <CatalogSidebar
        selectedCategory={selectedCategory}
        selectedKey={search.key}
        onAdd={addEntry}
      />
    );
  }

  if (activity === "meta") {
    return <MetaCatalogSidebar selectedKind={search.metaKind} selectedEntry={search.metaEntry} />;
  }

  if (activity === "library") {
    return <LibrarySidebar selectedKind={search.libraryKind} selectedEntry={search.libraryEntry} />;
  }

  return (
    <Panel>
      <PanelHeader uppercase>{t("fileTree.scenarioManifest")}</PanelHeader>
      <PanelBody className="file-tree-meta">
        <p className="file-tree-path" title={bundle.filePaths.scenario}>
          {bundle.filePaths.scenario}
        </p>
        {projectCodeTrusted === false && projectHasCustomCode ? (
          <p className="file-tree-trust-pill" title={t("fileTree.untrustedCustomCodeHint")}>
            {t("fileTree.untrustedCustomCodePill")}
          </p>
        ) : null}
        {!projectHasCustomCode ? (
          <aside className="file-tree-bootstrap">
            <div className="file-tree-bootstrap-heading">
              <Code2 size={13} aria-hidden="true" />
              <span>{t("fileTree.bootstrapCodeTitle")}</span>
              <span className="file-tree-bootstrap-optional">
                {t("fileTree.bootstrapCodeOptional")}
              </span>
            </div>
            <p className="file-tree-bootstrap-hint">{t("fileTree.bootstrapCodeHint")}</p>
            <Button
              className="file-tree-bootstrap-action"
              size="sm"
              onClick={() => void bootstrapProjectCode()}
            >
              {t("fileTree.bootstrapCode")}
            </Button>
          </aside>
        ) : null}
        <div className="file-tree-stats">
          <p>{t("fileTree.chaptersCount", { count: bundle.scenario.chapters.length })}</p>
          <p>{t("fileTree.itemsCount", { count: Object.keys(bundle.items.items).length })}</p>
          <p>
            {t("fileTree.charactersCount", {
              count: Object.keys(bundle.characters.characters).length,
            })}
          </p>
          {bundle.meta ? (
            <>
              <p>{t("fileTree.eventsCount", { count: Object.keys(bundle.meta.events).length })}</p>
              <p>{t("fileTree.flagsCount", { count: Object.keys(bundle.meta.flags).length })}</p>
            </>
          ) : null}
          {bundle.library ? (
            <>
              <p>
                {t("fileTree.snippetsCount", {
                  count: Object.keys(bundle.library.snippets).length,
                })}
              </p>
              <p>
                {t("fileTree.templatesCount", {
                  count: Object.keys(bundle.library.templates).length,
                })}
              </p>
            </>
          ) : null}
        </div>
      </PanelBody>
    </Panel>
  );
}
