import { ArrowUpRight, Trash2 } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import {
  buildLibraryUsageIndex,
  getLibraryUsages,
  libraryUsageNavigateTarget,
} from "@/lib/libraryUsage.js";
import { Page } from "@/lib/pages.js";
import { editorNavigate } from "@/lib/routeHelpers.js";
import { translate } from "@/lib/i18n.js";
import { confirmModal } from "@/lib/modalApi.js";
import { useScenarioStore } from "@/store/useScenarioStore.js";
import type { TextBlock } from "@/types/wire.js";
import { Button } from "@/components/ui/Button.js";
import { FormField } from "@/components/ui/FormField.js";
import { Input } from "@/components/ui/Input.js";
import { Select } from "@/components/ui/Select.js";
import { GateEditor } from "@/components/node/GateEditor.js";
import { InterpolationField } from "@/components/node/InterpolationField.js";

const TEXT_KINDS = ["paragraph", "dialogue", "thought", "stage_direction"];
const SIDES = ["left", "right", "center"];

interface Props {
  snippetId: string;
}

export function SnippetInspector({ snippetId }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const bundle = useScenarioStore((s) => s.bundle);
  const updateLibrarySnippet = useScenarioStore((s) => s.updateLibrarySnippet);
  const deleteLibrarySnippet = useScenarioStore((s) => s.deleteLibrarySnippet);

  const usageIndex = useMemo(() => (bundle ? buildLibraryUsageIndex(bundle) : new Map()), [bundle]);

  if (!bundle?.library) return null;

  const block = bundle.library.snippets[snippetId];
  if (!block) return null;

  const usages = getLibraryUsages(usageIndex, "snippet", snippetId);

  const patch = (patchBlock: TextBlock) => updateLibrarySnippet(snippetId, patchBlock);

  const handleDelete = async () => {
    const ok = await confirmModal({
      title: translate("library.confirmDeleteSnippet.title"),
      message: translate("library.confirmDeleteSnippet.message", { id: snippetId }),
      variant: "danger",
      confirmLabel: translate("common.delete"),
    });
    if (!ok) return;
    deleteLibrarySnippet(snippetId);
    void editorNavigate(navigate, {
      to: Page.EditorLibrary,
      search: { libraryKind: "snippet", libraryEntry: null },
    });
  };

  const characterOptions = [
    { value: "", label: t("common.none") },
    ...Object.values(bundle.characters.characters).map((c) => ({
      value: c.id,
      label: c.name ? `${c.name} (${c.id})` : c.id,
    })),
  ];

  return (
    <div className="catalog-detail catalog-detail--inspector">
      <header className="catalog-detail-header">
        <span className="font-mono text-[10px] text-muted">@{snippetId}</span>
        <Button
          variant="ghost"
          size="sm"
          icon
          leadingIcon={Trash2}
          className="catalog-detail-action catalog-detail-action--danger"
          aria-label={t("common.delete")}
          title={t("common.delete")}
          onClick={() => void handleDelete()}
        />
      </header>

      <div className="catalog-detail-fields">
        <FormField label={t("textBlock.kind")}>
          <Select
            options={TEXT_KINDS.map((k) => ({
              value: k,
              label: t(`textBlock.kinds.${k}`),
            }))}
            value={block.kind}
            onChange={(e) => patch({ ...block, kind: e.target.value })}
          />
        </FormField>
        <InterpolationField
          label={t("textBlock.text")}
          value={block.text}
          rows={4}
          onChange={(text) => patch({ ...block, text })}
        />
        <InterpolationField
          label={t("textBlock.else")}
          value={block.else ?? ""}
          rows={3}
          onChange={(elseText) => patch({ ...block, else: elseText || undefined })}
        />
        <FormField label={t("textBlock.speaker")}>
          <Select
            options={characterOptions}
            value={block.speaker ?? ""}
            onChange={(e) => patch({ ...block, speaker: e.target.value || undefined })}
          />
        </FormField>
        <FormField label={t("textBlock.emotion")}>
          <Input
            value={block.emotion ?? ""}
            onChange={(e) => patch({ ...block, emotion: e.target.value || undefined })}
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
              patch({ ...block, side: (e.target.value || undefined) as TextBlock["side"] })
            }
          />
        </FormField>
        <FormField label={t("textBlock.actor")} hint={t("textBlock.actorHint")}>
          <Select
            options={characterOptions}
            value={block.actor ?? ""}
            onChange={(e) => patch({ ...block, actor: e.target.value || undefined })}
          />
        </FormField>
        <GateEditor
          label={t("common.when")}
          value={block.when}
          onChange={(when) => patch({ ...block, when })}
        />
        <GateEditor
          label={t("common.unless")}
          value={block.unless}
          onChange={(unless) => patch({ ...block, unless })}
        />
      </div>

      <LibraryUsageSection usages={usages} t={t} navigate={navigate} />
    </div>
  );
}

function LibraryUsageSection({
  usages,
  t,
  navigate,
}: {
  usages: ReturnType<typeof getLibraryUsages>;
  t: (k: string, opts?: Record<string, string | number>) => string;
  navigate: ReturnType<typeof useNavigate>;
}) {
  if (usages.length === 0) {
    return (
      <section className="meta-usage-section">
        <p className="meta-usage-empty">{t("library.noUsages")}</p>
      </section>
    );
  }

  return (
    <section className="meta-usage-section">
      <h3 className="meta-usage-header">{t("library.usedIn")}</h3>
      <ul className="meta-usage-list">
        {usages.map((usage, index) => {
          const target = libraryUsageNavigateTarget(usage);
          const label =
            usage.context === "extends"
              ? t("library.usageExtends", { nodeId: usage.nodeId })
              : usage.context === "templateText"
                ? t("library.usageTemplateText", { templateId: usage.nodeId })
                : t("library.usageText", {
                    nodeId: usage.nodeId,
                    chapterId: usage.chapterId ?? "",
                  });

          return (
            <li key={`${usage.nodeId}-${usage.context}-${index}`}>
              <button
                type="button"
                className="meta-usage-link"
                onClick={() => void editorNavigate(navigate, target)}
              >
                <span>{label}</span>
                <ArrowUpRight size={10} />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export { LibraryUsageSection };
