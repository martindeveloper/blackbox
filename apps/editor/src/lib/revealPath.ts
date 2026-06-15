export async function revealPath(targetPath: string): Promise<boolean> {
  return (await window.electronAPI?.revealPath(targetPath)) ?? false;
}
