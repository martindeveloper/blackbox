import type { PreviewCheckpointPayload } from "@preview-protocol";

export interface PreviewCheckpointHandlers {
  capture: () => PreviewCheckpointPayload | null;
  restore: (checkpoint: PreviewCheckpointPayload) => void;
}

let handlers: PreviewCheckpointHandlers | null = null;

export function setPreviewCheckpointHandlers(next: PreviewCheckpointHandlers | null): void {
  handlers = next;
}

export function capturePreviewCheckpoint(): PreviewCheckpointPayload | null {
  return handlers?.capture() ?? null;
}

export function restorePreviewCheckpoint(checkpoint: PreviewCheckpointPayload): boolean {
  if (!handlers) return false;
  handlers.restore(checkpoint);
  return true;
}
