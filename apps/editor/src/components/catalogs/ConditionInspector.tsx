import { Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { editorNavigate } from "../../lib/routeHelpers.js";
import { translate } from "../../lib/i18n.js";
import { confirmModal } from "../../lib/modalApi.js";
import { Page } from "../../lib/pages.js";
import { useScenarioStore } from "../../store/useScenarioStore.js";
import type { Gate } from "../../types/wire.js";
import { Button } from "../ui/Button.js";
import { GateEditor } from "../node/GateEditor.js";

interface Props {
  conditionId: string;
}

export function ConditionInspector({ conditionId }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const bundle = useScenarioStore((s) => s.bundle);
  const updateLibraryCondition = useScenarioStore((s) => s.updateLibraryCondition);
  const deleteLibraryCondition = useScenarioStore((s) => s.deleteLibraryCondition);

  if (!bundle?.library) return null;

  const gate = bundle.library.conditions?.[conditionId];
  if (gate === undefined) return null;

  const handleDelete = async () => {
    const ok = await confirmModal({
      title: translate("library.confirmDeleteCondition.title"),
      message: translate("library.confirmDeleteCondition.message", { id: conditionId }),
      variant: "danger",
      confirmLabel: translate("common.delete"),
    });
    if (!ok) return;
    deleteLibraryCondition(conditionId);
    void editorNavigate(navigate, {
      to: Page.EditorLibrary,
      search: { libraryKind: "condition", libraryEntry: null },
    });
  };

  return (
    <div className="catalog-detail catalog-detail--inspector">
      <header className="catalog-detail-header">
        <span className="font-mono text-[10px] text-muted">{conditionId}</span>
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
        <p className="px-2 pb-1 text-[10px] text-muted">{t("library.conditionHint")}</p>
        <GateEditor
          label={t("library.conditionGate")}
          value={gate as Gate}
          onChange={(updated) => updateLibraryCondition(conditionId, updated as Gate)}
        />
      </div>
    </div>
  );
}
