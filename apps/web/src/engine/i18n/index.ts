import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { engineEn } from "./en.js";

export type I18nResources = Record<string, object>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const existing = result[key];
    result[key] =
      isPlainObject(existing) && isPlainObject(value) ? deepMerge(existing, value) : value;
  }
  return result;
}

const engineResources: I18nResources = { en: engineEn };

/** Initializes the shared i18next instance with engine defaults merged under
 *  the game's resources (game keys win). Must run before the first render. */
export function initI18n(gameResources: I18nResources): typeof i18n {
  const languages = new Set([...Object.keys(engineResources), ...Object.keys(gameResources)]);
  const resources: Record<string, { translation: object }> = {};
  for (const lng of languages) {
    resources[lng] = {
      translation: deepMerge(
        (engineResources[lng] ?? {}) as Record<string, unknown>,
        (gameResources[lng] ?? {}) as Record<string, unknown>,
      ),
    };
  }

  void i18n.use(initReactI18next).init({
    resources,
    lng: "en",
    fallbackLng: "en",
    interpolation: { escapeValue: false },
  });

  return i18n;
}

export default i18n;
