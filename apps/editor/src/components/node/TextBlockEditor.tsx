import { ArrowUpRight, Plus, Quote, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import type { TextBlock, TextEntry } from "../../types/wire.js";
import { textBlockHasDirection } from "../../lib/authorEditorHelpers.js";
import {
  isTextBlock,
  snippetIdFromTextEntry,
  snippetRef,
  snippetParamsFromTextEntry,
  textEntryKey,
} from "../../lib/libraryRefs.js";
import { navigateToLibraryEntry } from "../../lib/routeHelpers.js";
import { useScenarioStore } from "../../store/useScenarioStore.js";
import { Button } from "../ui/Button.js";
import { Card } from "../ui/Card.js";
import { FormField } from "../ui/FormField.js";
import { Input } from "../ui/Input.js";
import { Select } from "../ui/Select.js";
import { Textarea } from "../ui/Textarea.js";
import { GateEditor } from "./GateEditor.js";
import { InterpolationField } from "./InterpolationField.js";
import { AuthorDetails } from "./AuthorDetails.js";

const TEXT_KINDS = ["paragraph", "dialogue", "thought", "stage_direction"];
const SIDES = ["left", "right", "center"];

function SnippetParamAdder({
  existingKeys,
  onAdd,
}: {
  existingKeys: string[];
  onAdd: (key: string, value: string) => void;
}) {
  const { t } = useTranslation();
  const [key, setKey] = useState("");

  const handleAdd = () => {
    const trimmed = key.trim();
    if (!trimmed || existingKeys.includes(trimmed)) return;
    onAdd(trimmed, "");
    setKey("");
  };

  return (
    <div className="mt-2 flex items-end gap-2">
      <FormField label={t("textBlock.addSnippetParam")} className="flex-1">
        <Input
          mono
          placeholder={t("textBlock.snippetParamKeyPlaceholder")}
          value={key}
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
          }}
        />
      </FormField>
      <Button size="sm" leadingIcon={Plus} onClick={handleAdd}>
        {t("common.add")}
      </Button>
    </div>
  );
}

interface TextBlockEditorProps {
  entries: TextEntry[];
  onChange: (entries: TextEntry[]) => void;
}

export function TextBlockEditor({ entries, onChange }: TextBlockEditorProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const bundle = useScenarioStore((s) => s.bundle);

  const characterOptions = [
    { value: "", label: t("common.none") },
    ...Object.values(bundle?.characters.characters ?? {}).map((c) => ({
      value: c.id,
      label: c.name ? `${c.name} (${c.id})` : c.id,
    })),
  ];

  const snippetIds = Object.keys(bundle?.library?.snippets ?? {}).sort();

  const openSnippet = (snippetId: string) => {
    void navigateToLibraryEntry(navigate, "snippet", snippetId);
  };

  return (
    <div>
      {entries.map((entry, i) => {
        const snippetId = snippetIdFromTextEntry(entry);
        if (snippetId) {
          const known = Boolean(bundle?.library?.snippets[snippetId]);
          const params = snippetParamsFromTextEntry(entry) ?? {};
          const paramEntries = Object.entries(params);

          const updateSnippet = (nextId: string, nextParams: Record<string, string>) => {
            const copy = [...entries];
            copy[i] = snippetRef(nextId, nextParams);
            onChange(copy);
          };

          const updateParam = (key: string, value: string) => {
            updateSnippet(snippetId, { ...params, [key]: value });
          };

          const removeParam = (key: string) => {
            const next = { ...params };
            delete next[key];
            updateSnippet(snippetId, next);
          };

          return (
            <Card key={textEntryKey(entry, i)} className="mb-3 border-dashed">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span
                  className={`graph-node-badge graph-node-badge--snippet ${known ? "" : "graph-node-badge--unknown"}`}
                  title={known ? undefined : t("library.unknownSnippet")}
                >
                  <Quote size={8} />@{snippetId}
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    icon
                    title={t("library.openSnippet")}
                    onClick={() => openSnippet(snippetId)}
                  >
                    <ArrowUpRight size={12} />
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    leadingIcon={Trash2}
                    onClick={() => onChange(entries.filter((_, j) => j !== i))}
                  >
                    {t("common.remove")}
                  </Button>
                </div>
              </div>
              <FormField label={t("textBlock.snippetRef")}>
                <Select
                  options={[
                    { value: snippetId, label: `@${snippetId}` },
                    ...snippetIds
                      .filter((id) => id !== snippetId)
                      .map((id) => ({ value: id, label: `@${id}` })),
                  ]}
                  value={snippetId}
                  onChange={(e) => updateSnippet(e.target.value, params)}
                />
              </FormField>
              {paramEntries.length > 0 ? (
                <div className="space-y-2">
                  <span className="text-[10px] uppercase text-muted-2">
                    {t("textBlock.snippetParams")}
                  </span>
                  {paramEntries.map(([key, value]) => (
                    <div key={key} className="flex items-end gap-2">
                      <FormField label={key} className="flex-1">
                        <Textarea
                          className="min-h-[48px]"
                          value={value}
                          onChange={(e) => updateParam(key, e.target.value)}
                        />
                      </FormField>
                      <Button
                        variant="ghost"
                        size="sm"
                        leadingIcon={Trash2}
                        aria-label={t("common.remove")}
                        onClick={() => removeParam(key)}
                      />
                    </div>
                  ))}
                </div>
              ) : null}
              <SnippetParamAdder
                existingKeys={Object.keys(params)}
                onAdd={(key, value) => updateParam(key, value)}
              />
            </Card>
          );
        }

        if (!isTextBlock(entry)) return null;
        const block = entry;
        const hasDirection = textBlockHasDirection(block);

        const patchBlock = (patch: Partial<TextBlock>) => {
          const copy = [...entries];
          copy[i] = { ...block, ...patch };
          onChange(copy);
        };

        const speakerField = (
          <FormField layout="stacked" label={t("textBlock.speaker")}>
            <Select
              options={characterOptions}
              value={block.speaker ?? ""}
              onChange={(e) => patchBlock({ speaker: e.target.value || undefined })}
            />
          </FormField>
        );

        return (
          <Card key={textEntryKey(entry, i)} className="author-text-card mb-3">
            <div className="author-card-toolbar">
              <div className="author-block-type">
                <Select
                  aria-label={t("textBlock.kind")}
                  options={TEXT_KINDS.map((k) => ({
                    value: k,
                    label: t(`textBlock.kinds.${k}`),
                  }))}
                  value={block.kind}
                  onChange={(e) => patchBlock({ kind: e.target.value })}
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                icon
                title={t("textBlock.remove")}
                aria-label={t("textBlock.remove")}
                onClick={() => onChange(entries.filter((_, j) => j !== i))}
              >
                <Trash2 size={14} />
              </Button>
            </div>
            {block.kind === "dialogue" ? (
              <div className="author-speaker-row">{speakerField}</div>
            ) : null}
            <div className="author-prose">
              <InterpolationField
                layout="stacked"
                showHint={false}
                label={t("textBlock.whatHappens")}
                value={block.text}
                rows={6}
                placeholder={t(`textBlock.placeholders.${block.kind}`)}
                onChange={(text) => patchBlock({ text })}
              />
            </div>
            <AuthorDetails
              inline
              summary={t("textBlock.directionAndLogic")}
              configured={hasDirection}
              open={hasDirection}
            >
              {block.kind !== "dialogue" ? speakerField : null}
              <FormField label={t("textBlock.emotion")}>
                <Input
                  placeholder={t("textBlock.emotionPlaceholder")}
                  value={block.emotion ?? ""}
                  onChange={(e) => patchBlock({ emotion: e.target.value || undefined })}
                />
              </FormField>
              <FormField label={t("textBlock.side")}>
                <Select
                  options={[
                    { value: "", label: t("common.none") },
                    ...SIDES.map((s) => ({ value: s, label: t(`textBlock.sides.${s}`) })),
                  ]}
                  value={block.side ?? ""}
                  onChange={(e) =>
                    patchBlock({
                      side: (e.target.value || undefined) as TextBlock["side"],
                    })
                  }
                />
              </FormField>
              <FormField label={t("textBlock.actor")} hint={t("textBlock.actorHint")}>
                <Select
                  options={characterOptions}
                  value={block.actor ?? ""}
                  onChange={(e) => patchBlock({ actor: e.target.value || undefined })}
                />
              </FormField>
              <GateEditor
                label={t("textBlock.showOnlyWhen")}
                value={block.when}
                onChange={(when) => patchBlock({ when })}
              />
              <GateEditor
                label={t("textBlock.hideWhen")}
                value={block.unless}
                onChange={(unless) => patchBlock({ unless })}
              />
              <InterpolationField
                label={t("textBlock.else")}
                value={block.else ?? ""}
                rows={3}
                onChange={(elseText) => patchBlock({ else: elseText || undefined })}
              />
            </AuthorDetails>
          </Card>
        );
      })}
      <div className="author-block-actions">
        <Button
          className="author-add-button"
          leadingIcon={Plus}
          onClick={() => onChange([...entries, { kind: "paragraph", text: "" }])}
        >
          {t("textBlock.add")}
        </Button>
        {snippetIds.length > 0 ? (
          <Select
            className="max-w-[180px]"
            options={[
              { value: "", label: t("textBlock.insertSnippet") },
              ...snippetIds.map((id) => ({ value: id, label: `@${id}` })),
            ]}
            value=""
            onChange={(e) => {
              if (!e.target.value) return;
              onChange([...entries, snippetRef(e.target.value)]);
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
