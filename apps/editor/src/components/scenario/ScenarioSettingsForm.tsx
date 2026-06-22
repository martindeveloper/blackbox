import { Dices, Plus, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { translate } from "@/lib/i18n.js";
import { confirmModal } from "@/lib/modalApi.js";
import { Page } from "@/lib/pages.js";
import { editorNavigate } from "@/lib/routeHelpers.js";
import { useScenarioStore } from "@/store/useScenarioStore.js";
import {
  ASSETS_BUNDLE_SPEC,
  CATALOG_SPEC,
  CHAPTER_SPEC,
  CHARACTERS_SPEC,
  ITEMS_SPEC,
  LIBRARY_SPEC,
} from "@/types/wire.js";
import { Icon } from "@/components/icons/Icon.js";
import { ObjectSelector } from "@/components/pickers/ObjectSelector.js";
import { Button } from "@/components/ui/Button.js";
import { FieldRow } from "@/components/ui/FieldRow.js";
import { FormField } from "@/components/ui/FormField.js";
import { Input } from "@/components/ui/Input.js";
import { Section, SectionBody, SectionHeader } from "@/components/ui/Section.js";
import { ScenarioPlatformSettings } from "./ScenarioPlatformSettings.js";

interface ScenarioSettingsFormProps {
  expanded?: boolean;
}

export function ScenarioSettingsForm({ expanded = false }: ScenarioSettingsFormProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const bundle = useScenarioStore((s) => s.bundle);
  const updateScenario = useScenarioStore((s) => s.updateScenario);
  const addChapter = useScenarioStore((s) => s.addChapter);
  const removeChapter = useScenarioStore((s) => s.removeChapter);
  const renameChapterId = useScenarioStore((s) => s.renameChapterId);
  const addRelationshipOverride = useScenarioStore((s) => s.addRelationshipOverride);
  const createMetaCatalog = useScenarioStore((s) => s.createMetaCatalog);
  const createLibrary = useScenarioStore((s) => s.createLibrary);

  const [picker, setPicker] = useState<string | null>(null);
  const [newStatKey, setNewStatKey] = useState("");
  const [overrideCharId, setOverrideCharId] = useState("");

  if (!bundle) return null;

  const scenario = bundle.scenario;
  const stats = scenario.defaultStats ?? {};
  const statKeys = [
    ...new Set(["hp", "max_hp", "empathy", "logic", "violence", ...Object.keys(stats)]),
  ];

  const updateStat = (key: string, raw: string) => {
    const value = raw === "" ? undefined : Number(raw);
    const next = { ...stats };
    if (value === undefined) {
      delete next[key];
    } else {
      next[key] = value;
    }
    updateScenario({ defaultStats: Object.keys(next).length > 0 ? next : undefined });
  };

  const updateRelationshipOverride = (charId: string, metric: string, value: number) => {
    const overrides = { ...scenario.relationshipOverrides };
    overrides[charId] = { ...overrides[charId], [metric]: value };
    updateScenario({ relationshipOverrides: overrides });
  };

  return (
    <div className="scenario-manifest">
      <header className="scenario-manifest-head">
        <h1>{t("scenario.title")}</h1>
        <span className="scenario-manifest-meta">
          {t("scenario.summary", {
            chapters: scenario.chapters.length,
            stats: Object.keys(stats).length,
          })}
          {scenario.revision ? ` · rev ${scenario.revision}` : ""}
        </span>
      </header>

      <section className="scenario-panel">
        <div className="scenario-panel-body scenario-core-fields">
          <FormField label={t("common.title")}>
            <Input
              value={scenario.title ?? ""}
              onChange={(e) => updateScenario({ title: e.target.value })}
            />
          </FormField>
          <FormField label={t("scenario.revision")}>
            <Input
              mono
              value={scenario.revision ?? ""}
              onChange={(e) => updateScenario({ revision: e.target.value })}
            />
          </FormField>
          <FormField label={t("scenario.randomSeed")}>
            <div className="scenario-seed-field">
              <Input
                mono
                type="number"
                value={scenario.randomSeed ?? 0}
                onChange={(e) => updateScenario({ randomSeed: Number(e.target.value) })}
              />
              <Icon icon={Dices} size={13} />
            </div>
          </FormField>
        </div>
      </section>

      {expanded ? (
        <>
          <ScenarioPlatformSettings
            scenario={scenario}
            onChange={(platforms) => updateScenario({ platforms })}
          />

          <div className="scenario-manifest-grid">
            <Section className="scenario-card scenario-card--chapters">
              <SectionHeader>{t("scenario.chapters")}</SectionHeader>
              <SectionBody className="space-y-2">
                <div className="scenario-chapter-columns" aria-hidden>
                  <span>#</span>
                  <span>{t("scenario.chapterId")}</span>
                  <span>{t("scenario.chapterTitle")}</span>
                  <span>{t("scenario.chapterFile")}</span>
                </div>
                {scenario.chapters.map((ch, idx) => (
                  <div key={ch.id} className="scenario-chapter-row">
                    <span className="scenario-chapter-index">
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    <Input
                      mono
                      value={ch.id}
                      title={t("scenario.chapterId")}
                      onChange={(e) => {
                        const nextId = e.target.value;
                        const chapters = [...scenario.chapters];
                        const entry = chapters[idx];
                        if (!entry) return;
                        chapters[idx] = { ...entry, id: nextId };
                        updateScenario({ chapters });
                      }}
                      onBlur={(e) => {
                        const nextId = e.target.value.trim();
                        if (!nextId || nextId === ch.id) return;
                        if (!renameChapterId(ch.id, nextId)) {
                          const chapters = [...scenario.chapters];
                          chapters[idx] = { ...chapters[idx]!, id: ch.id };
                          updateScenario({ chapters });
                        }
                      }}
                    />
                    <Input
                      value={ch.title}
                      title={t("scenario.chapterTitle")}
                      onChange={(e) => {
                        const chapters = [...scenario.chapters];
                        const entry = chapters[idx];
                        if (!entry) return;
                        chapters[idx] = { ...entry, title: e.target.value };
                        updateScenario({ chapters });
                        const bundleChapter = bundle.chapters[ch.id];
                        if (bundleChapter) {
                          useScenarioStore
                            .getState()
                            .updateChapter(ch.id, { ...bundleChapter, title: e.target.value });
                        }
                      }}
                    />
                    <Input
                      mono
                      value={ch.ref}
                      title={t("scenario.chapterFile")}
                      onChange={(e) => {
                        const chapters = [...scenario.chapters];
                        const entry = chapters[idx];
                        if (!entry) return;
                        chapters[idx] = { ...entry, ref: e.target.value };
                        updateScenario({ chapters });
                      }}
                    />
                    <Button
                      size="sm"
                      icon
                      title={t("objectSelector.browse")}
                      onClick={() => setPicker(`chapter-${idx}`)}
                    >
                      <Icon icon={Plus} size={14} />
                    </Button>
                    <Button
                      variant="danger"
                      icon
                      title={t("scenario.removeChapter")}
                      disabled={scenario.chapters.length <= 1}
                      onClick={() => {
                        void (async () => {
                          const ok = await confirmModal({
                            title: translate("scenario.confirmRemoveChapter.title"),
                            message: translate("scenario.confirmRemoveChapter.message", {
                              chapterId: ch.id,
                            }),
                            variant: "danger",
                            confirmLabel: translate("common.delete"),
                          });
                          if (!ok) return;
                          removeChapter(ch.id);
                        })();
                      }}
                    >
                      <Icon icon={X} size={14} />
                    </Button>
                  </div>
                ))}
                {scenario.chapters.map((ch, idx) =>
                  picker === `chapter-${idx}` ? (
                    <ObjectSelector
                      key={ch.id}
                      mode={{ kind: "sidecar", specs: [CHAPTER_SPEC] }}
                      value={ch.ref}
                      title={`${t("scenario.chapters")}: ${ch.title}`}
                      onSelect={(v) => {
                        const chapters = [...scenario.chapters];
                        const entry = chapters[idx];
                        if (!entry) return;
                        chapters[idx] = { ...entry, ref: v };
                        updateScenario({ chapters });
                        setPicker(null);
                      }}
                      onClose={() => setPicker(null)}
                    />
                  ) : null,
                )}
                <Button
                  size="sm"
                  leadingIcon={Plus}
                  onClick={() => {
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
                  }}
                >
                  {t("scenario.addChapter")}
                </Button>
              </SectionBody>
            </Section>

            <Section className="scenario-card scenario-card--stats">
              <SectionHeader>{t("scenario.defaultStats")}</SectionHeader>
              <SectionBody>
                <div className="grid grid-cols-2 gap-2">
                  {statKeys.map((stat) => (
                    <FormField key={stat} label={stat}>
                      <Input
                        type="number"
                        placeholder={t("scenario.statUnset")}
                        value={stats[stat] ?? ""}
                        onChange={(e) => updateStat(stat, e.target.value)}
                      />
                    </FormField>
                  ))}
                </div>
                <FieldRow className="mt-2">
                  <Input
                    mono
                    placeholder={t("scenario.newStatKey")}
                    value={newStatKey}
                    onChange={(e) => setNewStatKey(e.target.value)}
                  />
                  <Button
                    size="sm"
                    leadingIcon={Plus}
                    onClick={() => {
                      const key = newStatKey.trim();
                      if (!key || stats[key] !== undefined) return;
                      updateStat(key, "0");
                      setNewStatKey("");
                    }}
                  >
                    {t("scenario.addStat")}
                  </Button>
                </FieldRow>
              </SectionBody>
            </Section>

            <Section className="scenario-card scenario-card--sidecars">
              <SectionHeader>{t("scenario.sidecarRefs")}</SectionHeader>
              <SectionBody>
                <div className="scenario-sidecar-row">
                  <span className="scenario-sidecar-label">{t("scenario.itemsRef")}</span>
                  <Input
                    mono
                    value={scenario.itemsRef ?? "items.json"}
                    onChange={(e) => updateScenario({ itemsRef: e.target.value })}
                  />
                  <Button
                    size="sm"
                    icon
                    title={t("objectSelector.browse")}
                    onClick={() => setPicker("items")}
                  >
                    <Icon icon={Plus} size={14} />
                  </Button>
                </div>
                <div className="scenario-sidecar-row">
                  <span className="scenario-sidecar-label">{t("scenario.charactersRef")}</span>
                  <Input
                    mono
                    value={scenario.charactersRef ?? "characters.json"}
                    onChange={(e) => updateScenario({ charactersRef: e.target.value })}
                  />
                  <Button
                    size="sm"
                    icon
                    title={t("objectSelector.browse")}
                    onClick={() => setPicker("characters")}
                  >
                    <Icon icon={Plus} size={14} />
                  </Button>
                </div>
                <div className="scenario-sidecar-row">
                  <span className="scenario-sidecar-label">{t("scenario.assetsRef")}</span>
                  <Input
                    mono
                    value={scenario.assetsRef ?? "assets.json"}
                    onChange={(e) => updateScenario({ assetsRef: e.target.value })}
                  />
                  <Button
                    size="sm"
                    icon
                    title={t("objectSelector.browse")}
                    onClick={() => setPicker("assets")}
                  >
                    <Icon icon={Plus} size={14} />
                  </Button>
                </div>
                <div className="scenario-sidecar-row">
                  <span className="scenario-sidecar-label">{t("scenario.catalogRef")}</span>
                  <Input
                    mono
                    value={scenario.catalogRef ?? ""}
                    placeholder={t("scenario.defaultCatalogFile")}
                    onChange={(e) => updateScenario({ catalogRef: e.target.value || undefined })}
                  />
                  <Button
                    size="sm"
                    icon
                    title={t("objectSelector.browse")}
                    onClick={() => setPicker("catalog")}
                  >
                    <Icon icon={Plus} size={14} />
                  </Button>
                </div>
                <div className="scenario-sidecar-row">
                  <span className="scenario-sidecar-label">{t("scenario.libraryRef")}</span>
                  <Input
                    mono
                    value={scenario.libraryRef ?? ""}
                    placeholder={t("scenario.defaultLibraryFile")}
                    onChange={(e) => updateScenario({ libraryRef: e.target.value || undefined })}
                  />
                  <Button
                    size="sm"
                    icon
                    title={t("objectSelector.browse")}
                    onClick={() => setPicker("library")}
                  >
                    <Icon icon={Plus} size={14} />
                  </Button>
                </div>
              </SectionBody>
            </Section>

            {picker === "items" && (
              <ObjectSelector
                mode={{ kind: "sidecar", specs: [ITEMS_SPEC] }}
                value={scenario.itemsRef ?? "items.json"}
                title={t("scenario.itemsRef")}
                onSelect={(v) => {
                  updateScenario({ itemsRef: v });
                  setPicker(null);
                }}
                onClose={() => setPicker(null)}
              />
            )}
            {picker === "characters" && (
              <ObjectSelector
                mode={{ kind: "sidecar", specs: [CHARACTERS_SPEC] }}
                value={scenario.charactersRef ?? "characters.json"}
                title={t("scenario.charactersRef")}
                onSelect={(v) => {
                  updateScenario({ charactersRef: v });
                  setPicker(null);
                }}
                onClose={() => setPicker(null)}
              />
            )}
            {picker === "assets" && (
              <ObjectSelector
                mode={{ kind: "sidecar", specs: [ASSETS_BUNDLE_SPEC] }}
                value={scenario.assetsRef ?? "assets.json"}
                title={t("scenario.assetsRef")}
                onSelect={(v) => {
                  updateScenario({ assetsRef: v });
                  setPicker(null);
                }}
                onClose={() => setPicker(null)}
              />
            )}
            {picker === "catalog" && (
              <ObjectSelector
                mode={{ kind: "sidecar", specs: [CATALOG_SPEC] }}
                value={scenario.catalogRef ?? "catalog.json"}
                title={t("scenario.catalogRef")}
                onSelect={(v) => {
                  updateScenario({ catalogRef: v });
                  setPicker(null);
                }}
                onClose={() => setPicker(null)}
              />
            )}
            {picker === "library" && (
              <ObjectSelector
                mode={{ kind: "sidecar", specs: [LIBRARY_SPEC] }}
                value={scenario.libraryRef ?? "library.json"}
                title={t("scenario.libraryRef")}
                onSelect={(v) => {
                  updateScenario({ libraryRef: v });
                  setPicker(null);
                }}
                onClose={() => setPicker(null)}
              />
            )}

            <Section className="scenario-card scenario-card--advanced">
              <SectionHeader>{t("scenario.relationshipOverrides")}</SectionHeader>
              <SectionBody className="space-y-3">
                {Object.entries(scenario.relationshipOverrides ?? {}).map(([charId, scores]) => {
                  const declared = bundle.characters.characters[charId]?.relationships ?? {};
                  return (
                    <div key={charId} className="space-y-2">
                      <span className="graph-node-id">{charId}</span>
                      <div className="grid grid-cols-2 gap-2">
                        {Object.keys(declared).map((metric) => (
                          <FormField key={metric} label={metric}>
                            <Input
                              type="number"
                              value={scores[metric] ?? declared[metric] ?? 0}
                              onChange={(e) =>
                                updateRelationshipOverride(charId, metric, Number(e.target.value))
                              }
                            />
                          </FormField>
                        ))}
                      </div>
                    </div>
                  );
                })}
                <div className="scenario-advanced-row">
                  <FormField label={t("effect.characterId")}>
                    <Input
                      mono
                      list="relationship-override-characters"
                      placeholder={t("scenario.addRelationshipOverride")}
                      value={overrideCharId}
                      onChange={(e) => setOverrideCharId(e.target.value)}
                    />
                    <datalist id="relationship-override-characters">
                      {Object.values(bundle.characters.characters)
                        .filter(
                          (character) => Object.keys(character.relationships ?? {}).length > 0,
                        )
                        .map((character) => (
                          <option key={character.id} value={character.id} />
                        ))}
                    </datalist>
                  </FormField>
                  <Button
                    size="sm"
                    leadingIcon={Plus}
                    onClick={() => {
                      const charId = overrideCharId.trim();
                      if (!charId) return;
                      addRelationshipOverride(charId);
                      setOverrideCharId("");
                    }}
                  >
                    {t("common.add")}
                  </Button>
                </div>
              </SectionBody>
            </Section>

            {!bundle.meta ? (
              <Section className="scenario-card scenario-card--provision">
                <SectionHeader>{t("scenario.metaCatalog")}</SectionHeader>
                <SectionBody>
                  <p className="mb-2 text-[11px] text-muted">{t("meta.noCatalog")}</p>
                  <Button size="sm" onClick={() => createMetaCatalog()}>
                    {t("scenario.createMetaCatalog")}
                  </Button>
                </SectionBody>
              </Section>
            ) : null}

            {!bundle.library ? (
              <Section className="scenario-card scenario-card--provision">
                <SectionHeader>{t("scenario.librarySidecar")}</SectionHeader>
                <SectionBody>
                  <p className="mb-2 text-[11px] text-muted">{t("library.noLibrary")}</p>
                  <Button size="sm" onClick={() => createLibrary()}>
                    {t("scenario.createLibrary")}
                  </Button>
                </SectionBody>
              </Section>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
