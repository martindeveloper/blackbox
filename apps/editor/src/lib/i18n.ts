import i18n from "../i18n/index.ts";

export function translate(key: string, options?: Record<string, unknown>): string {
  return i18n.t(key, options);
}
