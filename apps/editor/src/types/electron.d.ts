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
  outcome: "success" | "error";
  durationMs?: number;
}

export interface McpAuditResult {
  entries: McpAuditEntry[];
  path: string | null;
}

export interface ElectronAPI {
  isElectron: true;
  fetchEditorVersion: (signal?: AbortSignal) => Promise<EditorVersionPayload>;
  pickProjectFolder: () => Promise<string | null>;
  probeIdes: (customPath?: string) => Promise<IdeProbeResult>;
  pickIdeBinary: () => Promise<string | null>;
  openInIde: (projectPath: string, ideId?: string, customPath?: string) => Promise<boolean>;
  revealPath: (targetPath: string) => Promise<boolean>;
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
