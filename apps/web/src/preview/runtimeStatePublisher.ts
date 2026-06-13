let runtimeStatePublisher: (() => void) | null = null;

export function setPreviewRuntimeStatePublisher(publisher: (() => void) | null): void {
  runtimeStatePublisher = publisher;
}

export function publishPreviewRuntimeState(): void {
  runtimeStatePublisher?.();
}
