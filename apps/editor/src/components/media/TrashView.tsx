import { FileAudio, FileImage, RotateCcw, Trash2, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useScenarioStore } from "@/store/useScenarioStore.js";
import { formatSize, formatTrashedAt } from "@/lib/format.js";
import { Icon } from "@/components/icons/Icon.js";
import { Button } from "@/components/ui/Button.js";

export function TrashView() {
  const { t } = useTranslation();
  const trashItems = useScenarioStore((s) => s.trashItems);
  const restoreTrashItem = useScenarioStore((s) => s.restoreTrashItem);
  const permanentlyDeleteTrashItem = useScenarioStore((s) => s.permanentlyDeleteTrashItem);
  const emptyTrash = useScenarioStore((s) => s.emptyTrash);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = trashItems.find((item) => item.id === selectedId) ?? null;

  const toggle = (id: string) => setSelectedId((cur) => (cur === id ? null : id));

  return (
    <div className="media-content">
      <div className="media-toolbar">
        <span className="media-toolbar-path">
          {t("trash.toolbarCount", { count: trashItems.length })}
        </span>
        <div className="media-toolbar-actions">
          {selected && (
            <>
              <Button
                size="sm"
                leadingIcon={RotateCcw}
                onClick={() => void restoreTrashItem(selected.id)}
              >
                {t("trash.putBack")}
              </Button>
              <Button
                size="sm"
                variant="danger"
                leadingIcon={X}
                onClick={() => void permanentlyDeleteTrashItem(selected.id)}
              >
                {t("trash.delete")}
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant="danger"
            leadingIcon={Trash2}
            disabled={trashItems.length === 0}
            onClick={() => void emptyTrash()}
          >
            {t("trash.emptyTrash")}
          </Button>
        </div>
      </div>

      <div className="trash-list-area">
        {trashItems.length === 0 ? (
          <div className="media-empty">{t("trash.empty")}</div>
        ) : (
          <div className="trash-list">
            <div className="trash-row trash-row--header">
              <div className="trash-col-icon" />
              <div className="trash-col-name">{t("trash.columns.name")}</div>
              <div className="trash-col-path">{t("trash.columns.originalLocation")}</div>
              <div className="trash-col-date">{t("trash.columns.deleted")}</div>
              <div className="trash-col-size">{t("trash.columns.size")}</div>
            </div>

            {[...trashItems].reverse().map((item) => {
              const isImage = item.mimeType.startsWith("image/");
              const filename = item.originalPath.split("/").pop() ?? item.originalPath;
              const dir = item.originalPath.slice(0, item.originalPath.lastIndexOf("/"));
              const isSelected = selectedId === item.id;
              const { date, time } = formatTrashedAt(item.trashedAt);

              return (
                <button
                  type="button"
                  key={item.id}
                  className={`trash-row${isSelected ? " trash-row--selected" : ""}`}
                  onClick={() => toggle(item.id)}
                  onDoubleClick={() => void restoreTrashItem(item.id)}
                >
                  <div className="trash-col-icon">
                    <Icon
                      icon={isImage ? FileImage : FileAudio}
                      size={14}
                      style={{ color: "var(--editor-text-subtle)" }}
                    />
                  </div>
                  <div className="trash-col-name" title={filename}>
                    {filename}
                  </div>
                  <div className="trash-col-path" title={dir}>
                    {dir}
                  </div>
                  <div className="trash-col-date" title={item.trashedAt}>
                    <span>{date}</span>
                    <span className="trash-time">{time}</span>
                  </div>
                  <div className="trash-col-size">{formatSize(item.size)}</div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
