import { Api } from "./api.js";
import type { ThemePreference } from "../context/ThemeContext.js";

export interface UserPrefs {
  theme?: ThemePreference;
  leftColumnWidth?: number;
  rightColumnWidth?: number;
}

export async function fetchUserPrefs(): Promise<UserPrefs> {
  try {
    const res = await fetch(Api.Prefs);
    if (!res.ok) return {};
    return (await res.json()) as UserPrefs;
  } catch {
    return {};
  }
}

export async function saveUserPrefs(patch: Partial<UserPrefs>): Promise<void> {
  try {
    await fetch(Api.Prefs, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
  } catch {}
}
