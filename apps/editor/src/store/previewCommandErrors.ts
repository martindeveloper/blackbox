import type { TFunction } from "i18next";

export type PreviewCommandErrorCode = "disconnected" | "timeout" | "cancelled" | "failed";

export class PreviewCommandError extends Error {
  readonly code: PreviewCommandErrorCode;

  constructor(code: PreviewCommandErrorCode, message?: string) {
    super(message ?? code);
    this.name = "PreviewCommandError";
    this.code = code;
  }
}

export function previewCommandErrorMessage(error: unknown, t: TFunction): string | null {
  if (error instanceof PreviewCommandError) {
    switch (error.code) {
      case "disconnected":
        return t("preview.checkpoints.previewUnavailable");
      case "timeout":
        return t("preview.checkpoints.commandTimeout");
      case "cancelled":
        return null;
      case "failed":
        return error.message || t("preview.checkpoints.commandFailed");
    }
  }
  return error instanceof Error ? error.message : t("preview.checkpoints.commandFailed");
}
