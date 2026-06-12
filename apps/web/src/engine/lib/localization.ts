export type EngineTranslate = (key: string, options?: Record<string, unknown>) => string;

let translateEngineText: EngineTranslate = (key) => key;

export function setEngineTranslator(translate: EngineTranslate): void {
  translateEngineText = translate;
}

export function engineText(key: string, options?: Record<string, unknown>): string {
  return translateEngineText(key, options);
}
