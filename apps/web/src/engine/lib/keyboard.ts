export function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

export function matchesShortcut(event: KeyboardEvent, key: string): boolean {
  return event.key.toLocaleLowerCase() === key.toLocaleLowerCase();
}
