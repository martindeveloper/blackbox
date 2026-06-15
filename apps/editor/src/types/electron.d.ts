export interface IdeProbeResult {
  plugins: Array<{ id: string; available: boolean }>;
  customAvailable: boolean;
}

export interface ElectronAPI {
  isElectron: true;
  pickProjectFolder: () => Promise<string | null>;
  probeIdes: (customPath?: string) => Promise<IdeProbeResult>;
  pickIdeBinary: () => Promise<string | null>;
  openInIde: (projectPath: string, ideId?: string, customPath?: string) => Promise<boolean>;
  revealPath: (targetPath: string) => Promise<boolean>;
  setDirty: (dirty: boolean) => void;
  onSaveBeforeClose: (callback: () => void) => () => void;
  reportSaveBeforeClose: (saved: boolean) => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
