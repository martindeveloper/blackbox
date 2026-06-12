import type { TFunction } from "i18next";

export function statAbbrev(key: string, t: TFunction): string {
  const normalized = key.toLowerCase();
  const i18nKey = `vitals.stats.${normalized}`;
  const translated = t(i18nKey);
  if (translated !== i18nKey) return translated;
  return key.slice(0, 3).toUpperCase();
}
