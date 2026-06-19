import type { PreviewConsoleEntry, PreviewHostMessage } from "@preview-protocol";
import { isPreviewHostMessage as isHostMessage } from "@preview-protocol";
import { postPreviewMessage, toggleDeveloperConsole } from "@preview-mode";
import type { ProfilerEvent } from "../engine/lib/profiler.js";
import {
  clearAllPlayerStorage,
  clearPlayerSaveSlots,
  importPlayerStorageSnapshot,
  readPlayerStorageSnapshot,
} from "../engine/lib/playerStorageAdmin.js";
import {
  capturePreviewCheckpoint,
  restorePreviewCheckpoint,
} from "./checkpointBridge.js";
import { publishPreviewRuntimeState } from "./runtimeStatePublisher.js";

const STORAGE_PUBLISH_DEBOUNCE_MS = 200;

let storagePublishTimer: ReturnType<typeof setTimeout> | null = null;

export function publishPreviewStorage(): void {
  if (storagePublishTimer) clearTimeout(storagePublishTimer);
  storagePublishTimer = setTimeout(() => {
    storagePublishTimer = null;
    postPreviewMessage({ type: "storage-state", state: readPlayerStorageSnapshot() });
  }, STORAGE_PUBLISH_DEBOUNCE_MS);
}

export function flushPreviewStorage(): void {
  if (storagePublishTimer) {
    clearTimeout(storagePublishTimer);
    storagePublishTimer = null;
  }
  postPreviewMessage({ type: "storage-state", state: readPlayerStorageSnapshot() });
}

export function installPreviewHostCommands(
  profilerHistory: ProfilerEvent[],
  consoleHistory: PreviewConsoleEntry[],
): void {
  globalThis.addEventListener("blackbox:storage-changed", publishPreviewStorage);
  globalThis.addEventListener("message", (event) => {
    if (event.origin !== location.origin || event.source !== globalThis.parent) return;
    if (!isHostMessage(event.data)) return;
    handlePreviewHostCommand(event.data, profilerHistory, consoleHistory);
  });
}

function handlePreviewHostCommand(
  message: PreviewHostMessage,
  profilerHistory: ProfilerEvent[],
  consoleHistory: PreviewConsoleEntry[],
) {
  switch (message.type) {
    case "toggle-console":
      toggleDeveloperConsole();
      break;
    case "load-storage":
      try {
        importPlayerStorageSnapshot(message.state);
        flushPreviewStorage();
        postPreviewMessage({
          type: "storage-load-result",
          ok: true,
          message: "Preview data loaded.",
        });
        globalThis.location.reload();
      } catch (error) {
        postPreviewMessage({
          type: "storage-load-result",
          ok: false,
          message: error instanceof Error ? error.message : "Preview data could not be loaded.",
        });
      }
      break;
    case "request-state":
      publishPreviewRuntimeState();
      flushPreviewStorage();
      postPreviewMessage({ type: "profiler-history", events: profilerHistory });
      postPreviewMessage({ type: "console-history", entries: consoleHistory });
      break;
    case "clear-profiler":
      profilerHistory.length = 0;
      postPreviewMessage({ type: "profiler-history", events: profilerHistory });
      break;
    case "clear-console":
      consoleHistory.length = 0;
      postPreviewMessage({ type: "console-history", entries: consoleHistory });
      break;
    case "clear-saves":
      clearPlayerSaveSlots();
      flushPreviewStorage();
      postPreviewMessage({ type: "storage-cleared", scope: "saves" });
      break;
    case "clear-all":
      clearAllPlayerStorage();
      flushPreviewStorage();
      postPreviewMessage({ type: "storage-cleared", scope: "all" });
      break;
    case "capture-checkpoint": {
      try {
        const checkpoint = capturePreviewCheckpoint();
        if (!checkpoint) {
          postPreviewMessage({
            type: "checkpoint-capture-result",
            ok: false,
            message: "Play the game before creating a checkpoint.",
          });
          break;
        }
        postPreviewMessage({
          type: "checkpoint-capture-result",
          ok: true,
          checkpoint,
        });
      } catch (error) {
        postPreviewMessage({
          type: "checkpoint-capture-result",
          ok: false,
          message: error instanceof Error ? error.message : "Checkpoint could not be captured.",
        });
      }
      break;
    }
    case "restore-checkpoint":
      try {
        const restored = restorePreviewCheckpoint(message.checkpoint);
        if (!restored) {
          postPreviewMessage({
            type: "checkpoint-restore-result",
            ok: false,
            message: "Play the game before restoring a checkpoint.",
          });
          break;
        }
        postPreviewMessage({
          type: "checkpoint-restore-result",
          ok: true,
          message: "Checkpoint restored.",
        });
      } catch (error) {
        postPreviewMessage({
          type: "checkpoint-restore-result",
          ok: false,
          message: error instanceof Error ? error.message : "Checkpoint could not be restored.",
        });
      }
      break;
  }
}
