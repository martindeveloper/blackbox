import { Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { useScenarioStore } from "../../store/useScenarioStore.js";
import type { LibraryEntryKind } from "../../lib/libraryUsage.js";
import { editorNavigate } from "../../lib/routeHelpers.js";
import { Page } from "../../lib/pages.js";
import { Button } from "../ui/Button.js";
import { Input } from "../ui/Input.js";
import { ListItem } from "../ui/ListItem.js";
import { Panel, PanelBody, PanelHeader } from "../ui/Panel.js";

type TabKind = "all" | LibraryEntryKind;

interface Props {
  selectedKind: LibraryEntryKind;
  selectedEntry: string | null;
}

export function LibrarySidebar({ selectedKind, selectedEntry }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const bundle = useScenarioStore((s) => s.bundle);
  const addLibrarySnippet = useScenarioStore((s) => s.addLibrarySnippet);
  const addLibraryTemplate = useScenarioStore((s) => s.addLibraryTemplate);
  const addLibraryCondition = useScenarioStore((s) => s.addLibraryCondition);
  const [filter, setFilter] = useState("");
  const [tab, setTab] = useState<TabKind>("all");

  if (!bundle) return null;

  if (!bundle.library) {
    return (
      <Panel>
        <PanelHeader uppercase>{t("activity.library")}</PanelHeader>
        <PanelBody>
          <p className="catalog-sidebar-filter-empty">{t("library.noLibrary")}</p>
        </PanelBody>
      </Panel>
    );
  }

  const { snippets, templates, conditions } = bundle.library;
  const norm = filter.trim().toLowerCase();

  const matchesFilter = (id: string, preview?: string) => {
    if (!norm) return true;
    return id.toLowerCase().includes(norm) || (preview ?? "").toLowerCase().includes(norm);
  };

  const filteredSnippets = Object.entries(snippets)
    .filter(([id, block]) => matchesFilter(id, block.text))
    .sort(([a], [b]) => a.localeCompare(b));

  const filteredTemplates = Object.entries(templates)
    .filter(([id, template]) => matchesFilter(id, template.title))
    .sort(([a], [b]) => a.localeCompare(b));

  const filteredConditions = Object.keys(conditions ?? {})
    .filter((id) => matchesFilter(id))
    .sort((a, b) => a.localeCompare(b));

  const handleAdd = (kind: LibraryEntryKind) => {
    const id = `new_${Date.now()}`;
    if (kind === "snippet") addLibrarySnippet(id);
    else if (kind === "template") addLibraryTemplate(id);
    else addLibraryCondition(id);
    void editorNavigate(navigate, {
      to: Page.EditorLibrary,
      search: { libraryKind: kind, libraryEntry: id },
    });
  };

  const selectEntry = (kind: LibraryEntryKind, id: string) => {
    void editorNavigate(navigate, {
      to: Page.EditorLibrary,
      search: { libraryKind: kind, libraryEntry: id },
    });
  };

  const tabs: { id: TabKind; label: string }[] = [
    { id: "all", label: t("library.tabAll") },
    { id: "snippet", label: t("library.tabSnippets") },
    { id: "template", label: t("library.tabTemplates") },
    { id: "condition", label: t("library.tabConditions") },
  ];

  return (
    <Panel>
      <PanelHeader uppercase>{t("activity.library")}</PanelHeader>
      <div className="catalog-sidebar-filter">
        <Input
          compact
          mono
          type="search"
          value={filter}
          placeholder={t("library.filterPlaceholder")}
          aria-label={t("library.filterPlaceholder")}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <div className="library-tabs">
        {tabs.map((tb) => (
          <button
            key={tb.id}
            type="button"
            className={`library-tab${tb.id === tab ? " library-tab--active" : ""}`}
            onClick={() => setTab(tb.id)}
          >
            {tb.label}
          </button>
        ))}
      </div>
      <PanelBody>
        {(tab === "all" || tab === "snippet") && (
          <>
            <div className="flex items-center justify-between px-2 pt-2 pb-0.5">
              <span className="text-[9px] font-semibold uppercase tracking-widest text-muted">
                {t("library.snippetsSection")}
              </span>
              <Button
                size="sm"
                variant="ghost"
                icon
                title={t("library.addSnippet")}
                onClick={() => handleAdd("snippet")}
              >
                <Plus size={10} />
              </Button>
            </div>
            {filteredSnippets.length === 0 ? (
              <p className="catalog-sidebar-filter-empty">{t("library.filterEmpty")}</p>
            ) : (
              filteredSnippets.map(([id, block]) => (
                <ListItem
                  key={id}
                  selected={selectedKind === "snippet" && selectedEntry === id}
                  className="library-list-item"
                  onClick={() => selectEntry("snippet", id)}
                >
                  <span className="library-item-inner">
                    <span className="library-item-row">
                      <span className="library-badge library-badge--snippet">@</span>
                      <span className="library-item-id">{id}</span>
                    </span>
                    {block.text ? <span className="library-item-preview">{block.text}</span> : null}
                  </span>
                </ListItem>
              ))
            )}
          </>
        )}

        {(tab === "all" || tab === "template") && (
          <>
            <div className="flex items-center justify-between px-2 pt-2 pb-0.5">
              <span className="text-[9px] font-semibold uppercase tracking-widest text-muted">
                {t("library.templatesSection")}
              </span>
              <Button
                size="sm"
                variant="ghost"
                icon
                title={t("library.addTemplate")}
                onClick={() => handleAdd("template")}
              >
                <Plus size={10} />
              </Button>
            </div>
            {filteredTemplates.length === 0 ? (
              <p className="catalog-sidebar-filter-empty">{t("library.filterEmpty")}</p>
            ) : (
              filteredTemplates.map(([id, template]) => (
                <ListItem
                  key={id}
                  selected={selectedKind === "template" && selectedEntry === id}
                  className="library-list-item"
                  onClick={() => selectEntry("template", id)}
                >
                  <span className="library-item-inner">
                    <span className="library-item-row">
                      <span className="library-badge library-badge--template">T</span>
                      <span className="library-item-id">{template.title || id}</span>
                    </span>
                    {template.$extends ? (
                      <span className="library-item-preview">extends {template.$extends}</span>
                    ) : null}
                  </span>
                </ListItem>
              ))
            )}
          </>
        )}

        {(tab === "all" || tab === "condition") && (
          <>
            <div className="flex items-center justify-between px-2 pt-2 pb-0.5">
              <span className="text-[9px] font-semibold uppercase tracking-widest text-muted">
                {t("library.conditionsSection")}
              </span>
              <Button
                size="sm"
                variant="ghost"
                icon
                title={t("library.addCondition")}
                onClick={() => handleAdd("condition")}
              >
                <Plus size={10} />
              </Button>
            </div>
            {filteredConditions.length === 0 ? (
              <p className="catalog-sidebar-filter-empty">{t("library.filterEmpty")}</p>
            ) : (
              filteredConditions.map((id) => (
                <ListItem
                  key={id}
                  selected={selectedKind === "condition" && selectedEntry === id}
                  className="library-list-item"
                  onClick={() => selectEntry("condition", id)}
                >
                  <span className="library-item-inner">
                    <span className="library-item-row">
                      <span className="library-badge library-badge--condition">?</span>
                      <span className="library-item-id">{id}</span>
                    </span>
                  </span>
                </ListItem>
              ))
            )}
          </>
        )}
      </PanelBody>
    </Panel>
  );
}
