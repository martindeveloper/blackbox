import { ImageOff, Mic2, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { getCatalogEntry } from "@/lib/catalogHealth.js";
import { useMediaPreview } from "@/hooks/useMediaPreview.js";
import { useScenarioStore } from "@/store/useScenarioStore.js";
import { Page } from "@/lib/pages.js";
import { editorNavigate, useEditorSearch } from "@/lib/routeHelpers.js";
import type { CharacterDefinition } from "@/types/wire.js";
import { Icon } from "@/components/icons/Icon.js";
import { CatalogEntityCard, CatalogEntityGrid } from "./CatalogEntityGrid.js";
import { EntityIdToolbar } from "./EntityIdToolbar.js";

function CharacterPortraitCard({
  id,
  character,
  selected,
  onSelect,
}: {
  id: string;
  character: CharacterDefinition;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const bundle = useScenarioStore((s) => s.bundle);
  const projectId = useScenarioStore((s) => s.projectId);
  const portraitEntry =
    bundle && character.portraitRef
      ? getCatalogEntry(bundle.assets, "textures", character.portraitRef)
      : undefined;
  const { url: portraitUrl, loading } = useMediaPreview(projectId, portraitEntry?.src);

  return (
    <CatalogEntityCard
      id={id}
      name={character.name}
      selected={selected}
      onSelect={onSelect}
      selectedLabel={t("characters.selected")}
      imageUrl={portraitUrl}
      loading={loading}
      accent={character.color ?? "#df6c00"}
      fallbackIcon={portraitEntry ? UserRound : ImageOff}
      meta={
        <>
          <span className="catalog-entity-color-chip">
            <span style={{ background: character.color ?? "#df6c00" }} />
            {character.color ?? "#df6c00"}
          </span>
          {character.voiceRef ? (
            <span
              className="catalog-entity-meta-chip catalog-entity-meta-chip--trailing"
              title={character.voiceRef}
            >
              <Icon icon={Mic2} size={10} />
              {t("characters.voiced")}
            </span>
          ) : null}
        </>
      }
    />
  );
}

export function CharactersEditor() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const search = useEditorSearch();
  const bundle = useScenarioStore((s) => s.bundle);
  const addCharacter = useScenarioStore((s) => s.addCharacter);

  if (!bundle) return null;

  const chars = Object.entries(bundle.characters.characters).sort(([a], [b]) => a.localeCompare(b));
  const normalizedFilter = search.characterFilter.trim().toLowerCase();
  const visibleChars = chars.filter(([id, character]) => {
    if (!normalizedFilter || search.character === id) return true;
    return [id, character.name, character.portraitRef, character.voiceRef]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(normalizedFilter));
  });

  return (
    <div className="flex h-full flex-col bg-surface">
      <EntityIdToolbar
        placeholder={t("characters.newIdPlaceholder")}
        addLabel={t("characters.add")}
        onAdd={(id) => {
          addCharacter(id);
          void editorNavigate(navigate, { to: Page.EditorCharacters, search: { character: id } });
        }}
      />
      <CatalogEntityGrid
        kicker={t("characters.cast")}
        title={t("characters.portraitsTitle")}
        countLabel={
          normalizedFilter
            ? t("characters.filteredCount", {
                visible: visibleChars.length,
                total: chars.length,
              })
            : t("characters.count", { count: chars.length })
        }
        emptyLabel={t("characters.filterEmpty")}
        isEmpty={visibleChars.length === 0}
      >
        {visibleChars.map(([id, char]) => (
          <CharacterPortraitCard
            key={id}
            id={id}
            character={char}
            selected={search.character === id}
            onSelect={() =>
              void editorNavigate(navigate, {
                to: Page.EditorCharacters,
                search: { character: id },
              })
            }
          />
        ))}
      </CatalogEntityGrid>
    </div>
  );
}
