import type { GameView } from "../types/game.js";
import { type StatusKind } from "./engine.js";
import { readAllSlots } from "./slots.js";
import { bundleStore } from "./bundleStore.js";
import { getLogLevel, logger } from "./logger.js";
import { getClientLogEntries, getEngineLogEntries, MAX_LOG_ENTRIES } from "./supportLog.js";
import { createZip } from "./zip.js";
import { getWebPlayerOptions, readPlayerStorage } from "./playerConfig.js";

interface SupportBundleInput {
  stateJson?: string;
  view?: GameView;
  status: string;
  statusKind: StatusKind;
}

export function downloadSupportBundle(input: SupportBundleInput): void {
  logger.info("support", "Creating support bundle");
  try {
    const createdAt = new Date();
    const clientLogs = getClientLogEntries();
    const engineLogs = getEngineLogEntries();
    const diagnostics = collectDiagnostics(input, createdAt, clientLogs.length, engineLogs.length);
    const zip = createZip({
      "README.txt": [
        "Blackbox support bundle",
        `Created: ${createdAt.toISOString()}`,
        "",
        "Contents:",
        "- logs/client.ndjson: web client logs",
        "- logs/engine.ndjson: Rust/WASM engine logs",
        "- state/save.json: current serialized engine state",
        "- state/view.json: current client view",
        "- diagnostics.json: browser, bundle, settings, and session diagnostics",
        "",
        "This archive may contain gameplay state and device/browser details.",
      ].join("\n"),
      "logs/client.ndjson": toNdjson(clientLogs),
      "logs/engine.ndjson": toNdjson(engineLogs),
      "state/save.json": input.stateJson
        ? JSON.stringify(JSON.parse(input.stateJson), null, 2)
        : "null",
      "state/view.json": JSON.stringify(input.view ?? null, null, 2),
      "diagnostics.json": JSON.stringify(diagnostics, null, 2),
    });

    const url = URL.createObjectURL(zip);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `blackbox-support-${createdAt.toISOString().replace(/[:.]/g, "-")}.zip`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    logger.info("support", "Support bundle downloaded", {
      clientLogEntries: clientLogs.length,
      engineLogEntries: engineLogs.length,
      bytes: zip.size,
    });
  } catch (error) {
    logger.error("support", "Support bundle failed", error);
  }
}

function collectDiagnostics(
  input: SupportBundleInput,
  createdAt: Date,
  clientLogEntries: number,
  engineLogEntries: number,
): Record<string, unknown> {
  const nav = navigator as Navigator & {
    connection?: {
      effectiveType?: string;
      downlink?: number;
      rtt?: number;
      saveData?: boolean;
    };
    deviceMemory?: number;
  };

  return {
    createdAt: createdAt.toISOString(),
    page: {
      url: location.href,
      origin: location.origin,
      visibilityState: document.visibilityState,
      language: navigator.language,
      languages: navigator.languages,
      online: navigator.onLine,
    },
    browser: {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      vendor: navigator.vendor,
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemory: nav.deviceMemory,
      cookieEnabled: navigator.cookieEnabled,
      connection: nav.connection,
    },
    display: {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      screen: {
        width: screen.width,
        height: screen.height,
        availWidth: screen.availWidth,
        availHeight: screen.availHeight,
        colorDepth: screen.colorDepth,
        pixelDepth: screen.pixelDepth,
      },
      devicePixelRatio: window.devicePixelRatio,
    },
    bundle: bundleStore.diagnostics,
    session: {
      status: input.status,
      statusKind: input.statusKind,
      nodeId: input.view?.node_id ?? null,
      mode: input.view?.mode ?? null,
      scenarioTitle: input.view?.scenario_title ?? null,
      chapterId: input.view?.chapter_id ?? null,
      chapterTitle: input.view?.chapter_title ?? null,
    },
    settings: {
      theme: document.documentElement.dataset.theme ?? "unknown",
      logLevel: getLogLevel(),
      analyticsAvailable: getWebPlayerOptions().settings.analytics.available,
      analyticsEnabled: readPlayerStorage("analytics-enabled"),
      masterVolume: readPlayerStorage("master-volume"),
      musicVolume: readPlayerStorage("music-volume"),
      sfxVolume: readPlayerStorage("sfx-volume"),
    },
    storage: {
      gameId: getWebPlayerOptions().gameId,
      slotCount: getWebPlayerOptions().saves.slots,
      slotsOccupied: readAllSlots().filter(Boolean).length,
      localStorageAvailable: storageAvailable(),
    },
    logs: {
      clientEntries: clientLogEntries,
      engineEntries: engineLogEntries,
      maximumEntriesPerStream: MAX_LOG_ENTRIES,
    },
    time: {
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      utcOffsetMinutes: -createdAt.getTimezoneOffset(),
      pageUptimeMs: Math.round(performance.now()),
    },
  };
}

function toNdjson(entries: readonly unknown[]): string {
  if (!entries.length) return "";
  return `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`;
}

function storageAvailable(): boolean {
  try {
    const key = "__blackbox_support_storage_test";
    localStorage.setItem(key, key);
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
