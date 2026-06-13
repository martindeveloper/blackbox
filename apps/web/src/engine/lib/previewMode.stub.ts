import type { PreviewPlayerNotification } from "@preview-protocol";

export const PREVIEW_ENABLED = false as const;

export function notifyStorageChanged(): void {}

export function postPreviewMessage(_notification: PreviewPlayerNotification): void {}

export function toggleDeveloperConsole(): void {}
