export interface ElectronAPI {
  isElectron: true;
  pickProjectFolder: () => Promise<string | null>;
  setDirty: (dirty: boolean) => void;
  onSaveBeforeClose: (callback: () => void) => () => void;
  reportSaveBeforeClose: (saved: boolean) => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
