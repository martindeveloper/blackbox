export type ShortcutPlatform = "mac" | "windows" | "linux";

export type ShortcutChord = {
  key: string;
  meta?: boolean;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
};

export type ShortcutDefinition = {
  titleKey: string;
  bindings: Record<ShortcutPlatform, readonly ShortcutChord[]>;
};

export const SHORTCUTS = {
  omniboxOpen: {
    titleKey: "shortcuts.omniboxOpen",
    bindings: {
      mac: [{ key: "k", meta: true }],
      windows: [{ key: "k", ctrl: true }],
      linux: [{ key: "k", ctrl: true }],
    },
  },
  projectSave: {
    titleKey: "shortcuts.projectSave",
    bindings: {
      mac: [{ key: "s", meta: true }],
      windows: [{ key: "s", ctrl: true }],
      linux: [{ key: "s", ctrl: true }],
    },
  },
  historyUndo: {
    titleKey: "graph.help.shortcuts.undo",
    bindings: {
      mac: [{ key: "z", meta: true }],
      windows: [{ key: "z", ctrl: true }],
      linux: [{ key: "z", ctrl: true }],
    },
  },
  historyRedo: {
    titleKey: "graph.help.shortcuts.redo",
    bindings: {
      mac: [{ key: "z", meta: true, shift: true }],
      windows: [
        { key: "y", ctrl: true },
        { key: "z", ctrl: true, shift: true },
      ],
      linux: [
        { key: "y", ctrl: true },
        { key: "z", ctrl: true, shift: true },
      ],
    },
  },
  graphAddNode: {
    titleKey: "graph.help.shortcuts.addNode",
    bindings: {
      mac: [{ key: "n" }],
      windows: [{ key: "n" }],
      linux: [{ key: "n" }],
    },
  },
  graphAddChoice: {
    titleKey: "graph.help.shortcuts.addChoice",
    bindings: {
      mac: [{ key: "c" }],
      windows: [{ key: "c" }],
      linux: [{ key: "c" }],
    },
  },
  graphDeleteNode: {
    titleKey: "graph.help.shortcuts.deleteNode",
    bindings: {
      mac: [{ key: "backspace" }, { key: "delete" }],
      windows: [{ key: "backspace" }, { key: "delete" }],
      linux: [{ key: "backspace" }, { key: "delete" }],
    },
  },
  graphArrange: {
    titleKey: "graph.help.shortcuts.arrange",
    bindings: {
      mac: [{ key: "l" }],
      windows: [{ key: "l" }],
      linux: [{ key: "l" }],
    },
  },
  graphFit: {
    titleKey: "graph.help.shortcuts.fit",
    bindings: {
      mac: [{ key: "f" }],
      windows: [{ key: "f" }],
      linux: [{ key: "f" }],
    },
  },
  graphAnalytics: {
    titleKey: "graph.help.shortcuts.analytics",
    bindings: {
      mac: [{ key: "h" }],
      windows: [{ key: "h" }],
      linux: [{ key: "h" }],
    },
  },
  graphDeselect: {
    titleKey: "graph.help.shortcuts.deselect",
    bindings: {
      mac: [{ key: "escape" }],
      windows: [{ key: "escape" }],
      linux: [{ key: "escape" }],
    },
  },
  graphHelp: {
    titleKey: "graph.help.shortcuts.help",
    bindings: {
      mac: [{ key: "?", shift: true }],
      windows: [{ key: "?", shift: true }],
      linux: [{ key: "?", shift: true }],
    },
  },
} as const satisfies Record<string, ShortcutDefinition>;

export type ShortcutAction = keyof typeof SHORTCUTS;

export const GRAPH_HELP_SHORTCUTS = [
  "graphAddNode",
  "graphAddChoice",
  "graphDeleteNode",
  "graphArrange",
  "graphFit",
  "graphAnalytics",
  "historyUndo",
  "historyRedo",
  "graphDeselect",
  "graphHelp",
] as const satisfies readonly ShortcutAction[];

export function detectShortcutPlatform(): ShortcutPlatform {
  if (typeof navigator === "undefined") return "linux";
  const platform = navigator.platform ?? "";
  const userAgent = navigator.userAgent ?? "";
  if (/Mac|iPhone|iPad|iPod/.test(platform) || /Macintosh/.test(userAgent)) return "mac";
  if (/Win/.test(platform) || /Windows/.test(userAgent)) return "windows";
  return "linux";
}

export function shortcutBindings(
  action: ShortcutAction,
  platform: ShortcutPlatform = detectShortcutPlatform(),
): readonly ShortcutChord[] {
  return SHORTCUTS[action].bindings[platform];
}

function normalizeEventKey(key: string): string {
  const lower = key.toLowerCase();
  if (lower === "esc") return "escape";
  return lower;
}

function chordKeyMatches(eventKey: string, chordKey: string): boolean {
  const event = normalizeEventKey(eventKey);
  const chord = normalizeEventKey(chordKey);
  if (event === chord) return true;
  if (chord === "backspace" && (event === "backspace" || event === "delete")) return true;
  if (chord === "delete" && (event === "delete" || event === "backspace")) return true;
  return false;
}

export function matchesShortcut(
  event: KeyboardEvent,
  action: ShortcutAction,
  platform: ShortcutPlatform = detectShortcutPlatform(),
): boolean {
  return shortcutBindings(action, platform).some((chord) => chordMatches(event, chord, platform));
}

function chordMatches(
  event: KeyboardEvent,
  chord: ShortcutChord,
  _platform: ShortcutPlatform,
): boolean {
  if (!chordKeyMatches(event.key, chord.key)) return false;

  const needsMod = Boolean(chord.meta || chord.ctrl);
  if (needsMod) {
    if (!(event.metaKey || event.ctrlKey)) return false;
  } else if (event.metaKey || event.ctrlKey || event.altKey) {
    return false;
  }

  if (Boolean(chord.shift) !== event.shiftKey) return false;
  if (Boolean(chord.alt) !== event.altKey) return false;
  return true;
}

function chordLabelParts(chord: ShortcutChord, platform: ShortcutPlatform): string[] {
  const parts: string[] = [];
  if (platform === "mac") {
    if (chord.ctrl) parts.push("⌃");
    if (chord.alt) parts.push("⌥");
    if (chord.shift) parts.push("⇧");
    if (chord.meta) parts.push("⌘");
  } else {
    if (chord.ctrl) parts.push("Ctrl");
    if (chord.alt) parts.push("Alt");
    if (chord.shift) parts.push("Shift");
    if (chord.meta) parts.push("Win");
  }
  parts.push(displayKeyLabel(chord.key, platform));
  return parts;
}

function displayKeyLabel(key: string, platform: ShortcutPlatform): string {
  const normalized = normalizeEventKey(key);
  const macLabels: Record<string, string> = {
    backspace: "⌫",
    delete: "⌫",
    escape: "Esc",
  };
  const desktopLabels: Record<string, string> = {
    backspace: "Backspace",
    delete: "Del",
    escape: "Esc",
  };
  const labels = platform === "mac" ? macLabels : desktopLabels;
  if (labels[normalized]) return labels[normalized]!;
  if (normalized.length === 1) return normalized.toUpperCase();
  return key;
}

export function formatShortcutParts(
  action: ShortcutAction,
  platform: ShortcutPlatform = detectShortcutPlatform(),
): string[] {
  const chord = shortcutBindings(action, platform)[0];
  if (!chord) return [];
  return chordLabelParts(chord, platform);
}

export function formatShortcutVariants(
  action: ShortcutAction,
  platform: ShortcutPlatform = detectShortcutPlatform(),
): readonly string[][] {
  const seen = new Set<string>();
  const variants: string[][] = [];
  for (const chord of shortcutBindings(action, platform)) {
    const parts = chordLabelParts(chord, platform);
    const signature = parts.join("\0");
    if (seen.has(signature)) continue;
    seen.add(signature);
    variants.push(parts);
  }
  return variants;
}

export function formatShortcutKeys(
  action: ShortcutAction,
  platform: ShortcutPlatform = detectShortcutPlatform(),
): string {
  const parts = formatShortcutParts(action, platform);
  if (parts.length === 0) return "";
  if (platform === "mac") return parts.join("");
  return parts.join("+");
}

export function shortcutTitle(
  label: string,
  action: ShortcutAction,
  platform: ShortcutPlatform = detectShortcutPlatform(),
): string {
  const keys = formatShortcutKeys(action, platform);
  return keys ? `${label} (${keys})` : label;
}
