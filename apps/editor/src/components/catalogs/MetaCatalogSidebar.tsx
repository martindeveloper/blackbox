import { Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { useScenarioStore } from "../../store/useScenarioStore.js";
import type { MetaEntryKind } from "../../lib/metaUsage.js";
import { editorNavigate, navigateToMetaEntry } from "../../lib/routeHelpers.js";
import { Page } from "../../lib/pages.js";
import { Button } from "../ui/Button.js";
import { Input } from "../ui/Input.js";
import { ListItem } from "../ui/ListItem.js";
import { Panel, PanelBody, PanelHeader } from "../ui/Panel.js";

type TabKind = "all" | MetaEntryKind;

interface Props {
  selectedKind: MetaEntryKind;
  selectedEntry: string | null;
}

export function MetaCatalogSidebar({ selectedKind, selectedEntry }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const bundle = useScenarioStore((s) => s.bundle);
  const addMetaEntry = useScenarioStore((s) => s.addMetaEntry);
  const [filter, setFilter] = useState("");
  const [tab, setTab] = useState<TabKind>("all");

  if (!bundle) return null;

  if (!bundle.meta) {
    return (
      <Panel>
        <PanelHeader uppercase>{t("activity.meta")}</PanelHeader>
        <PanelBody>
          <p className="catalog-sidebar-filter-empty">{t("meta.noCatalog")}</p>
        </PanelBody>
      </Panel>
    );
  }

  const { events, flags } = bundle.meta;
  const norm = filter.trim().toLowerCase();

  const matchesFilter = (id: string, title?: string) => {
    if (!norm) return true;
    return id.toLowerCase().includes(norm) || (title ?? "").toLowerCase().includes(norm);
  };

  const filteredEvents = Object.entries(events)
    .filter(([id, e]) => matchesFilter(id, e.title))
    .sort(([a], [b]) => a.localeCompare(b));

  const filteredFlags = Object.entries(flags)
    .filter(([id, f]) => matchesFilter(id, f.title))
    .sort(([a], [b]) => a.localeCompare(b));

  const handleAdd = (kind: MetaEntryKind) => {
    const id = `new_${Date.now()}`;
    addMetaEntry(kind, id);
    void navigateToMetaEntry(navigate, kind, id);
  };

  const selectEntry = (kind: MetaEntryKind, id: string) => {
    void editorNavigate(navigate, {
      to: Page.EditorMeta,
      search: { metaKind: kind, metaEntry: id },
    });
  };

  const tabs: { id: TabKind; label: string }[] = [
    { id: "all", label: t("meta.tabAll") },
    { id: "event", label: t("meta.tabEvents") },
    { id: "flag", label: t("meta.tabFlags") },
  ];

  return (
    <Panel>
      <PanelHeader uppercase>{t("activity.meta")}</PanelHeader>
      <div className="catalog-sidebar-filter">
        <Input
          compact
          mono
          type="search"
          value={filter}
          placeholder={t("meta.filterPlaceholder")}
          aria-label={t("meta.filterPlaceholder")}
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
        {(tab === "all" || tab === "event") && (
          <>
            <div className="flex items-center justify-between px-2 pt-2 pb-0.5">
              <span className="text-[9px] font-semibold uppercase tracking-widest text-muted">
                {t("meta.eventsSection")}
              </span>
              <Button
                size="sm"
                variant="ghost"
                icon
                title={t("meta.addEvent")}
                onClick={() => handleAdd("event")}
              >
                <Plus size={10} />
              </Button>
            </div>
            {filteredEvents.length === 0 ? (
              <p className="catalog-sidebar-filter-empty">{t("meta.filterEmpty")}</p>
            ) : (
              filteredEvents.map(([id, entry]) => (
                <ListItem
                  key={id}
                  selected={selectedKind === "event" && selectedEntry === id}
                  onClick={() => selectEntry("event", id)}
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="shrink-0 rounded bg-accent/20 px-1 py-px font-mono text-[8px] uppercase text-accent">
                      E
                    </span>
                    <span className="truncate font-mono text-[10px]">{entry.title || id}</span>
                    {entry.internal && (
                      <span className="ml-auto shrink-0 text-[8px] text-muted-2">
                        {t("meta.internalBadge")}
                      </span>
                    )}
                  </span>
                </ListItem>
              ))
            )}
          </>
        )}

        {(tab === "all" || tab === "flag") && (
          <>
            <div className="flex items-center justify-between px-2 pt-2 pb-0.5">
              <span className="text-[9px] font-semibold uppercase tracking-widest text-muted">
                {t("meta.flagsSection")}
              </span>
              <Button
                size="sm"
                variant="ghost"
                icon
                title={t("meta.addFlag")}
                onClick={() => handleAdd("flag")}
              >
                <Plus size={10} />
              </Button>
            </div>
            {filteredFlags.length === 0 ? (
              <p className="catalog-sidebar-filter-empty">{t("meta.filterEmpty")}</p>
            ) : (
              filteredFlags.map(([id, entry]) => (
                <ListItem
                  key={id}
                  selected={selectedKind === "flag" && selectedEntry === id}
                  onClick={() => selectEntry("flag", id)}
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="shrink-0 rounded bg-secondary/20 px-1 py-px font-mono text-[8px] uppercase text-secondary">
                      F
                    </span>
                    <span className="truncate font-mono text-[10px]">{entry.title || id}</span>
                    {entry.internal && (
                      <span className="ml-auto shrink-0 text-[8px] text-muted-2">
                        {t("meta.internalBadge")}
                      </span>
                    )}
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
