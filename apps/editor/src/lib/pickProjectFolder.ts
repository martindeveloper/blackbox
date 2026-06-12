export async function pickProjectFolder(): Promise<string | null> {
  const picker = window.electronAPI?.pickProjectFolder;
  if (!picker) {
    throw new Error("Folder picker is only available in the desktop app");
  }
  return picker();
}
