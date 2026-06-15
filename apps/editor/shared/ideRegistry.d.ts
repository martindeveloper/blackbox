export declare const IDE_PLUGINS: ReadonlyArray<{ id: string; label: string }>;
export declare const DEFAULT_IDE_ID: string;
export declare const CUSTOM_IDE_ID: "custom";
export declare function isRegisteredIdeId(id: string): boolean;
export declare function isValidPreferredIde(id: string): boolean;
export declare function getIdePluginMeta(id: string): { id: string; label: string } | null;
