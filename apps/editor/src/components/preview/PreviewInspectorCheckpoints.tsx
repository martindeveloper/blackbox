import { useEffect, useState } from "react";
import { BookmarkPlus, RotateCcw, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  createPreviewCheckpoint,
  deletePreviewCheckpoint,
  listPreviewCheckpoints,
  readPreviewCheckpoint,
  toCheckpointPayload,
  toCheckpointSummary,
  type PreviewCheckpointSummary,
} from "../../lib/previewCheckpointsApi.js";
import { notifyError, notifySuccess } from "../../lib/notifyApi.js";
import { useScenarioStore } from "../../store/useScenarioStore.js";
import {
  previewCommandErrorMessage,
  requestPreviewCommand,
  usePreviewStore,
} from "../../store/usePreviewStore.js";
import { Icon } from "../icons/Icon.js";
import { displayValue, formatDate, SectionTitle } from "./previewInspectorUtils.js";

function PreviewInspectorCheckpointsLoaded({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const connected = usePreviewStore((store) => store.connected);
  const commandSender = usePreviewStore((store) => store.commandSender);
  const runtimePhase = usePreviewStore((store) => store.runtimeState.phase);
  const [checkpoints, setCheckpoints] = useState<PreviewCheckpointSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const canInteract = connected && Boolean(commandSender);
  const canUseCheckpoints = canInteract && runtimePhase === "ready";

  useEffect(() => {
    let cancelled = false;
    void listPreviewCheckpoints(projectId)
      .then((response) => {
        if (cancelled) return;
        setCheckpoints(response.checkpoints);
        setLoading(false);
      })
      .catch((error) => {
        if (cancelled) return;
        notifyError(error instanceof Error ? error.message : t("preview.checkpoints.loadFailed"));
        setCheckpoints([]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, t]);

  const handleCreate = async () => {
    if (!canUseCheckpoints || creating) return;
    setCreating(true);
    try {
      const captured = await requestPreviewCommand(
        () => usePreviewStore.getState().commandSender,
        { type: "capture-checkpoint" },
      );
      const saved = await createPreviewCheckpoint(projectId, captured);
      setCheckpoints((current) => [toCheckpointSummary(saved.checkpoint), ...current]);
      notifySuccess(t("preview.checkpoints.created"));
    } catch (error) {
      const message = previewCommandErrorMessage(error, t);
      if (message) notifyError(message);
    } finally {
      setCreating(false);
    }
  };

  const handleRestore = async (checkpointId: string) => {
    if (!canUseCheckpoints || restoringId) return;
    setRestoringId(checkpointId);
    try {
      const { checkpoint } = await readPreviewCheckpoint(projectId, checkpointId);
      await requestPreviewCommand(() => usePreviewStore.getState().commandSender, {
        type: "restore-checkpoint",
        checkpoint: toCheckpointPayload(checkpoint),
      });
      notifySuccess(t("preview.checkpoints.restored"));
    } catch (error) {
      const message = previewCommandErrorMessage(error, t);
      if (message) notifyError(message);
    } finally {
      setRestoringId(null);
    }
  };

  const handleDelete = async (checkpointId: string) => {
    if (deletingId) return;
    setDeletingId(checkpointId);
    try {
      await deletePreviewCheckpoint(projectId, checkpointId);
      setCheckpoints((current) => current.filter((entry) => entry.id !== checkpointId));
      notifySuccess(t("preview.checkpoints.deleted"));
    } catch (error) {
      notifyError(error instanceof Error ? error.message : t("preview.checkpoints.deleteFailed"));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      <div className="preview-inspector-title-row">
        <SectionTitle
          icon={BookmarkPlus}
          title={t("preview.checkpoints.title")}
          count={checkpoints.length}
        />
        <div className="preview-state-actions">
          <button
            type="button"
            disabled={!canUseCheckpoints || creating}
            onClick={() => void handleCreate()}
          >
            <Icon icon={BookmarkPlus} size={11} />
            <span>
              {creating ? t("preview.checkpoints.creating") : t("preview.checkpoints.create")}
            </span>
          </button>
        </div>
      </div>

      {!canUseCheckpoints && canInteract ? (
        <div className="preview-checkpoint-hint">{t("preview.checkpoints.playFirst")}</div>
      ) : null}

      <div className="preview-checkpoint-list">
        {loading ? (
          <div className="preview-storage-empty">{t("preview.checkpoints.loading")}</div>
        ) : checkpoints.length ? (
          checkpoints.map((checkpoint) => {
            const busy =
              restoringId === checkpoint.id ||
              deletingId === checkpoint.id ||
              (creating && restoringId === null && deletingId === null);
            return (
              <article key={checkpoint.id} className="preview-checkpoint-row">
                <p
                  className="preview-checkpoint-line"
                  title={[
                    displayValue(checkpoint.nodeId),
                    displayValue(checkpoint.chapterId),
                    checkpoint.location,
                    formatDate(checkpoint.createdAt),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                >
                  <strong>{displayValue(checkpoint.nodeId)}</strong>
                  <span>
                    {[
                      displayValue(checkpoint.chapterId),
                      checkpoint.location,
                      formatDate(checkpoint.createdAt),
                    ]
                      .filter((part) => part && part !== "—")
                      .join(" · ")}
                  </span>
                </p>
                <div className="preview-checkpoint-actions">
                  <button
                    type="button"
                    disabled={!canUseCheckpoints || busy}
                    title={t("preview.checkpoints.restore")}
                    aria-label={t("preview.checkpoints.restore")}
                    onClick={() => void handleRestore(checkpoint.id)}
                  >
                    <Icon icon={RotateCcw} size={11} />
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    title={t("preview.checkpoints.delete")}
                    aria-label={t("preview.checkpoints.delete")}
                    onClick={() => void handleDelete(checkpoint.id)}
                  >
                    <Icon icon={Trash2} size={11} />
                  </button>
                </div>
              </article>
            );
          })
        ) : (
          <div className="preview-storage-empty">{t("preview.checkpoints.empty")}</div>
        )}
      </div>
    </>
  );
}

export function PreviewInspectorCheckpoints() {
  const { t } = useTranslation();
  const projectId = useScenarioStore((store) => store.projectId);

  return (
    <section className="preview-inspector-section">
      {projectId ? (
        <PreviewInspectorCheckpointsLoaded key={projectId} projectId={projectId} />
      ) : (
        <>
          <div className="preview-inspector-title-row">
            <SectionTitle icon={BookmarkPlus} title={t("preview.checkpoints.title")} count={0} />
          </div>
          <div className="preview-storage-empty">{t("preview.checkpoints.empty")}</div>
        </>
      )}
    </section>
  );
}
