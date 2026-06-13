import { PREVIEW_MESSAGE_SOURCE, type PreviewPlayerNotification } from "@preview-protocol";

export const PREVIEW_ENABLED = true as const;

const STORAGE_CHANGED_EVENT = "blackbox:storage-changed";

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
