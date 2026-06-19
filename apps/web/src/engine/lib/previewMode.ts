import { PREVIEW_MESSAGE_SOURCE, type PreviewPlayerNotification } from "@preview-protocol";
import { readPlayerStorageSnapshot } from "./playerStorageAdmin.js";

export const PREVIEW_ENABLED = true as const;

const STORAGE_CHANGED_EVENT = "blackbox:storage-changed";
const STORAGE_PUBLISH_DEBOUNCE_MS = 200;

let storagePublishTimer: ReturnType<typeof setTimeout> | null = null;

export function toggleDeveloperConsole(): void {
  document.dispatchEvent(new KeyboardEvent("keydown", { code: "Backquote" }));
}

export function notifyStorageChanged(): void {
  globalThis.dispatchEvent(new Event(STORAGE_CHANGED_EVENT));
}

export function postPreviewMessage(notification: PreviewPlayerNotification): void {
  if (globalThis.parent === globalThis.self) return;
  globalThis.parent.postMessage(
    { source: PREVIEW_MESSAGE_SOURCE, ...notification },
    location.origin,
  );
}

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
