export interface IdeProbeResult {
  plugins: Array<{ id: string; available: boolean }>;
  customAvailable: boolean;
}

export interface EditorVersionPayload {
  editor?: {
    version?: string;
    releaseUrl?: string;
    downloadUrl?: string;
  };
}

export interface ElectronAPI {
  isElectron: true;
  fetchEditorVersion: (signal?: AbortSignal) => Promise<EditorVersionPayload>;
  pickProjectFolder: () => Promise<string | null>;
  probeIdes: (customPath?: string) => Promise<IdeProbeResult>;
  pickIdeBinary: () => Promise<string | null>;
  openInIde: (projectPath: string, ideId?: string, customPath?: string) => Promise<boolean>;
  revealPath: (targetPath: string) => Promise<boolean>;
  setDirty: (dirty: boolean) => void;
  onRequestClose: (callback: () => void) => () => void;
  confirmClose: () => void;
  cancelClose: () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
