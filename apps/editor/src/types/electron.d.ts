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

export interface McpStatus {
  enabled: boolean;
  endpoint: string | null;
  token: string | null;
  transport: "streamable-http";
  config: {
    mcpServers: {
      "blackbox-editor": {
        type: "streamable-http";
        url: string;
        headers: { Authorization: string };
      };
    };
  } | null;
}

export interface McpAuditEntry {
  timestamp: string;
  type: "tool" | "service";
  client?: { name: string; version: string | null; userAgent?: string | null };
  tool?: string;
  operation?: string;
  arguments?: Record<string, unknown>;
  changes?: McpAuditChange[];
  changeCount?: number;
  changesTruncated?: boolean;
  revision?: number;
  outcome: "success" | "error";
  durationMs?: number;
}

export interface McpAuditChange {
  action: "added" | "removed" | "edited";
  entity:
    | "node"
    | "choice"
    | "chapter"
    | "item"
    | "character"
    | "event"
    | "flag"
    | "texture"
    | "music"
    | "sound"
    | "snippet"
    | "template"
    | "condition";
  id: string;
  parentId?: string;
  chapterId?: string;
}

export interface McpAuditResult {
  entries: McpAuditEntry[];
  path: string | null;
}

export type InstallableDependency = "ffmpeg" | "cwebp";

export interface DependencyInstallInfo {
  dependency: InstallableDependency;
  platform: "windows" | "macos" | "linux";
  platformLabel: string;
  packageManager: string | null;
  command: string;
  canInstall: boolean;
  unavailableReason: string | null;
}

export interface DependencyInstallResult {
  ok: boolean;
  output: string;
  restartRequired: boolean;
}

export interface ElectronAPI {
  isElectron: true;
  fetchEditorVersion: (signal?: AbortSignal) => Promise<EditorVersionPayload>;
  pickProjectFolder: () => Promise<string | null>;
  probeIdes: (customPath?: string) => Promise<IdeProbeResult>;
  pickIdeBinary: () => Promise<string | null>;
  openInIde: (projectPath: string, ideId?: string, customPath?: string) => Promise<boolean>;
  revealPath: (targetPath: string) => Promise<boolean>;
  getDependencyInstallInfo: (dependency: InstallableDependency) => Promise<DependencyInstallInfo>;
  installDependency: (dependency: InstallableDependency) => Promise<DependencyInstallResult>;
  getMcpStatus: () => Promise<McpStatus>;
  setMcpEnabled: (enabled: boolean) => Promise<McpStatus>;
  getMcpAudit: (limit?: number) => Promise<McpAuditResult>;
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
