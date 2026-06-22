export type NotificationType = "success" | "error" | "warning" | "info";

export interface NotifyOptions {
  message: string;
  type?: NotificationType;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export interface NotifyApi {
  push: (options: NotifyOptions) => string;
  dismiss: (id: string) => void;
}

let notifyApi: NotifyApi | null = null;

export function registerNotifyApi(api: NotifyApi | null): void {
  notifyApi = api;
}

export function notify(options: NotifyOptions): string {
  if (notifyApi) return notifyApi.push(options);
  console.warn("[notify]", options.type ?? "info", options.message);
  return "";
}

export const notifySuccess = (message: string, duration?: number) =>
  notify({ message, type: "success", duration });

export const notifyError = (message: string, duration?: number) =>
  notify({ message, type: "error", duration });

export function notifyFromError(error: unknown, duration?: number): void {
  notifyError(error instanceof Error ? error.message : String(error), duration);
}
