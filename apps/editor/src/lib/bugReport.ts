import { EDITOR_VERSION } from "@shared/editorVersion.js";
import { useBuildStore } from "@/store/useBuildStore.js";
import { usePreviewStore } from "@/store/usePreviewStore.js";
import { useScenarioStore } from "@/store/useScenarioStore.js";
import { useToolRunnerStore } from "@/store/useToolRunnerStore.js";
import { createStoreZip, jsonEntry, textEntry, type ZipEntry } from "./storeZip.js";

export interface BugReportContext {
  comment: string;
  pathname: string;
  theme: string;
  themePreference: string;
}

function safeFilenameStamp(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

function runtimeInfo() {
  const nav = typeof navigator !== "undefined" ? navigator : null;
  const ua = nav?.userAgent ?? "unknown";
  const platform =
    (nav &&
      "userAgentData" in nav &&
      (nav as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform) ||
    nav?.platform ||
    "unknown";

  return {
    electron: Boolean(window.electronAPI?.isElectron),
    userAgent: ua,
    platform,
    language: nav?.language ?? null,
    languages: nav?.languages ? [...nav.languages] : [],
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    online: nav?.onLine ?? null,
    hardwareConcurrency: nav?.hardwareConcurrency ?? null,
    deviceMemory:
      nav && "deviceMemory" in nav
        ? (nav as Navigator & { deviceMemory?: number }).deviceMemory
        : null,
    screen:
      typeof screen !== "undefined"
        ? {
            width: screen.width,
            height: screen.height,
            availWidth: screen.availWidth,
            availHeight: screen.availHeight,
            pixelRatio: window.devicePixelRatio,
          }
        : null,
    viewport:
      typeof window !== "undefined"
        ? { width: window.innerWidth, height: window.innerHeight }
        : null,
  };
}

export function collectBugReportEntries(context: BugReportContext): ZipEntry[] {
  const scenario = useScenarioStore.getState();
  const build = useBuildStore.getState();
  const preview = usePreviewStore.getState();
  const tools = useToolRunnerStore.getState();

  const report = {
    generatedAt: new Date().toISOString(),
    editorVersion: EDITOR_VERSION,
    runtime: runtimeInfo(),
    ui: {
      pathname: context.pathname,
      theme: context.theme,
      themePreference: context.themePreference,
      hash: typeof window !== "undefined" ? window.location.hash : null,
    },
    project: {
      projectId: scenario.projectId,
      projectName: scenario.projectName,
      projectPath: scenario.projectPath,
      revision: scenario.revision,
      conflict: scenario.conflict,
      dirty: [...scenario.dirty],
      saving: scenario.saving,
      scenarioTitle: scenario.bundle?.scenario.title ?? null,
      chapterCount: scenario.bundle ? Object.keys(scenario.bundle.chapters).length : 0,
    },
    validation: {
      issueCount: scenario.validationIssues.length,
      issues: scenario.validationIssues,
    },
    build: {
      platform: build.platform,
      configuration: build.configuration,
      reactCompiler: build.reactCompiler,
      selectedStages: build.selectedStages,
      run: build.run,
      logLineCount: build.log.length,
      preflightLoading: build.preflightLoading,
      preflightError: build.preflightError,
      capabilities: build.capabilities,
    },
    preview: {
      connected: preview.connected,
      runtimeState: preview.runtimeState,
      storageKeys: Object.keys(preview.storageState),
      consoleEntryCount: preview.consoleEntries.length,
      profilerEventCount: preview.profilerEvents.length,
    },
    tools: {
      activeTool: tools.activeTool,
      runState: tools.runState,
      discovery: tools.discovery,
    },
    comment: context.comment.trim() || null,
  };

  const entries: ZipEntry[] = [
    jsonEntry("report.json", report),
    textEntry("comment.txt", context.comment.trim() || "(no comment provided)\n"),
    textEntry("build-log.txt", build.log.length ? `${build.log.join("\n")}\n` : "(empty)\n"),
    jsonEntry("validation-issues.json", scenario.validationIssues),
    jsonEntry("preview-console.json", preview.consoleEntries),
    jsonEntry("preview-profiler.json", preview.profilerEvents),
    textEntry(
      "environment.txt",
      [
        `Blackbox Editor ${EDITOR_VERSION}`,
        `Generated: ${report.generatedAt}`,
        `Runtime: ${report.runtime.electron ? "Electron" : "Browser"}`,
        `Platform: ${report.runtime.platform}`,
        `User agent: ${report.runtime.userAgent}`,
        `Language: ${report.runtime.language ?? "unknown"}`,
        `Timezone: ${report.runtime.timezone}`,
        `Route: ${context.pathname}`,
        `Theme: ${context.theme} (${context.themePreference})`,
        `Project: ${scenario.projectName ?? "(none)"}`,
        `Project path: ${scenario.projectPath ?? "(none)"}`,
        "",
        "User comment:",
        context.comment.trim() || "(none)",
        "",
      ].join("\n"),
    ),
  ];

  return entries;
}

export function createBugReportBlob(context: BugReportContext): Blob {
  const zipBytes = createStoreZip(collectBugReportEntries(context));
  return new Blob([new Uint8Array(zipBytes)], { type: "application/zip" });
}

export function downloadBugReport(context: BugReportContext): void {
  const blob = createBugReportBlob(context);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = `blackbox-bug-report-${safeFilenameStamp()}.zip`;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}
