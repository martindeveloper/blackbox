import fs from "node:fs/promises";
import path from "node:path";

async function writeJsonIfChanged(filePath, value) {
  const contents = `${JSON.stringify(value, null, 2)}\n`;
  const existing = await fs.readFile(filePath, "utf8").catch(() => null);
  if (existing === contents) return false;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, contents);
  return true;
}

async function readJsonObject(filePath) {
  const text = await fs.readFile(filePath, "utf8").catch(() => null);
  if (text === null) return null;
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value) ? value : false;
  } catch {
    return false;
  }
}

async function writeSettings(projectPath, typescriptLib, existing = {}) {
  const settings = { ...existing };
  settings["js/ts.tsdk.path"] = path.resolve(typescriptLib).split(path.sep).join("/");
  settings["js/ts.tsdk.promptToUseWorkspaceVersion"] = true;
  return writeJsonIfChanged(path.join(projectPath, ".vscode", "settings.json"), settings);
}

async function writeExtensions(projectPath) {
  const filePath = path.join(projectPath, ".vscode", "extensions.json");
  const extensions = await readJsonObject(filePath);
  if (extensions === false) return false;
  const recommendations = Array.isArray(extensions?.recommendations)
    ? extensions.recommendations
    : [];
  return writeJsonIfChanged(filePath, {
    ...extensions,
    recommendations: [...new Set([...recommendations, "oxc.oxc-vscode"])],
  });
}

export const VSCODE_FAMILY_GITIGNORE_ENTRIES = [".vscode/settings.json"];

export async function ensureVsCodeFamilyProjectSettings(projectPath, { typescriptLib }) {
  const settingsPath = path.join(projectPath, ".vscode", "settings.json");
  const existing = await readJsonObject(settingsPath);
  if (existing === false) return false;
  const settingsChanged = await writeSettings(projectPath, typescriptLib, existing ?? {});
  const extensionsChanged = await writeExtensions(projectPath);
  return settingsChanged || extensionsChanged;
}
