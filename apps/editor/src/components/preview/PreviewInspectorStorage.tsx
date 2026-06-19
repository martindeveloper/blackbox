import { useRef } from "react";
import { Clock3, Database, Download, Settings2, Trash2, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PREVIEW_STORAGE_EXPORT_FORMAT } from "../../../players/web/protocol.js";
import { usePreviewStore, type PreviewStorageState } from "../../store/usePreviewStore.js";
import { useScenarioStore } from "../../store/useScenarioStore.js";
import { notifyError, notifySuccess } from "../../lib/notifyApi.js";
import { Icon } from "../icons/Icon.js";
import {
  asRecord,
  countEntries,
  displayValue,
  Fact,
  formatDate,
  formatPlaytime,
  RawData,
  SectionTitle,
  activeFlagCount,
} from "./previewInspectorUtils.js";

function SlotCard({
  storageKey,
  value,
  active,
}: {
  storageKey: string;
  value: unknown;
  active: boolean;
}) {
  const { t } = useTranslation();
  const slot = asRecord(value) ?? {};
  const state = asRecord(slot.state);
  const player = asRecord(state?.player);
  const inventory = asRecord(asRecord(state?.inventory)?.items);
  const slotNumber = Number(storageKey.split(":")[1]) + 1;

  return (
    <article className="preview-slot-card">
      <header>
        <span>
          <Icon icon={Database} size={12} />
          {t("preview.saveSlot", { number: slotNumber })}
        </span>
        <em className={active ? "is-active" : undefined}>
          {active ? t("preview.activeSlot") : t("preview.savedSlot")}
        </em>
      </header>
      <div className="preview-slot-location">
        <strong title={displayValue(slot.nodeId)}>{displayValue(slot.nodeId)}</strong>
        <span>{displayValue(slot.chapterId)}</span>
      </div>
      <div className="preview-slot-meta">
        <span>
          <Icon icon={Clock3} size={11} />
          {formatPlaytime(slot.totalPlaytimeMs)}
        </span>
        <span>{formatDate(slot.savedAt)}</span>
      </div>
      <div className="preview-slot-counters">
        <Fact label={t("preview.stats")} value={countEntries(player?.stats)} />
        <Fact label={t("preview.inventory")} value={countEntries(inventory)} />
        <Fact label={t("preview.flags")} value={activeFlagCount(state?.flags)} />
      </div>
      <RawData label={t("preview.inspectSlot")} value={slot} />
    </article>
  );
}

export function PreviewInspectorStorage({ state }: { state: PreviewStorageState }) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const projectName = useScenarioStore((store) => store.projectName);
  const connected = usePreviewStore((store) => store.connected);
  const commandSender = usePreviewStore((store) => store.commandSender);
  const entries = Object.entries(state);
  const activeSlot =
    typeof state["last-used-slot"] === "number"
      ? state["last-used-slot"]
      : Number(state["last-used-slot"]);
  const slots = entries
    .filter(([key]) => key.startsWith("save-slot:"))
    .sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true }));
  const settings = entries.filter(([key]) => !key.startsWith("save-slot:"));
  const canTransfer = connected && Boolean(commandSender);

  const exportStorage = () => {
    const envelope = {
      format: PREVIEW_STORAGE_EXPORT_FORMAT,
      version: 1,
      exportedAt: new Date().toISOString(),
      project: projectName,
      storage: state,
    };
    const blob = new Blob([JSON.stringify(envelope, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const safeProject = (projectName ?? "project").replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
    link.href = url;
    link.download = `${safeProject}-preview-data-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    link.click();
    URL.revokeObjectURL(url);
    notifySuccess(t("preview.stateExported"));
  };

  const loadStorage = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const root = asRecord(parsed);
      const importedStorage =
        root?.format === PREVIEW_STORAGE_EXPORT_FORMAT && root ? asRecord(root.storage) : root;
      if (!importedStorage) throw new Error(t("preview.invalidStateFile"));
      commandSender?.({ type: "load-storage", state: importedStorage });
    } catch (error) {
      notifyError(error instanceof Error ? error.message : t("preview.invalidStateFile"));
    }
  };

  return (
    <section className="preview-inspector-section">
      <div className="preview-inspector-title-row">
        <SectionTitle icon={Database} title={t("preview.localStorage")} count={entries.length} />
        <div className="preview-state-actions">
          <button type="button" disabled={!canTransfer} onClick={exportStorage}>
            <Icon icon={Download} size={11} />
            <span>{t("preview.exportState")}</span>
          </button>
          <button
            type="button"
            disabled={!canTransfer}
            onClick={() => fileInputRef.current?.click()}
          >
            <Icon icon={Upload} size={11} />
            <span>{t("preview.loadState")}</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void loadStorage(file);
            }}
          />
        </div>
      </div>

      {settings.length > 0 && (
        <div className="preview-summary-card">
          <div className="preview-card-label">
            <Icon icon={Settings2} size={12} />
            {t("preview.preferences")}
          </div>
          <div className="preview-settings-list">
            {settings.map(([key, value]) => (
              <Fact key={key} label={key} value={value} />
            ))}
          </div>
        </div>
      )}

      <div className="preview-slot-toolbar">
        <span className="preview-slot-toolbar-label">
          {t("preview.saveSlots")}
          {slots.length > 0 ? <em>{slots.length}</em> : null}
        </span>
        <button
          type="button"
          className="preview-slot-toolbar-clear"
          disabled={!canTransfer}
          onClick={() => commandSender?.({ type: "clear-saves" })}
        >
          <Icon icon={Trash2} size={11} />
          <span>{t("preview.clearSaves")}</span>
        </button>
      </div>

      <div className="preview-slot-list">
        {slots.length ? (
          slots.map(([key, value]) => (
            <SlotCard
              key={key}
              storageKey={key}
              value={value}
              active={Number(key.split(":")[1]) === activeSlot}
            />
          ))
        ) : (
          <div className="preview-storage-empty">{t("preview.noSaveSlots")}</div>
        )}
      </div>
    </section>
  );
}
