export type ModalVariant = "default" | "danger";

export interface ConfirmModalOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ModalVariant;
  closeAborts?: boolean;
}

export interface AlertModalOptions {
  title: string;
  message: string;
  confirmLabel?: string;
}

export interface ModalApi {
  confirm: (options: ConfirmModalOptions) => Promise<boolean | null>;
  alert: (options: AlertModalOptions) => Promise<void>;
}

let modalApi: ModalApi | null = null;

export function registerModalApi(api: ModalApi | null): void {
  modalApi = api;
}

export async function confirmModal(options: ConfirmModalOptions): Promise<boolean | null> {
  if (modalApi) return modalApi.confirm(options);
  return window.confirm(options.message);
}
