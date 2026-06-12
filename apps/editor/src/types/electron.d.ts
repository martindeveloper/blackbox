export interface ElectronAPI {
  isElectron: true;
  pickProjectFolder: () => Promise<string | null>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
