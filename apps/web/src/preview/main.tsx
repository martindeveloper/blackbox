import { game } from "@game/game.js";
import { bootGame, type GameDefinition } from "../engine/boot.js";
import { postPreviewMessage } from "@preview-mode";
import { PREVIEW_PROFILER_HISTORY_LIMIT, type PreviewConsoleEntry } from "@preview-protocol";
import { Profiler, setProfilerSink, type ProfilerEvent } from "../engine/lib/profiler.js";
import { configurePreviewLoader, configurePreviewSource } from "../engine/lib/previewSource.js";
import { fetchPreviewDocs, readPreviewParams, subscribePreviewHotReload } from "./previewLoader.js";
import { installPreviewConsoleBridge } from "./consoleBridge.js";
import { installPreviewHostCommands, publishPreviewStorage } from "./hostCommands.js";

export function startPreviewPlayer(): void {
  const consoleHistory: PreviewConsoleEntry[] = [];
  installPreviewConsoleBridge(consoleHistory);

  const { apiBase, projectId } = readPreviewParams();
  const profilerHistory: ProfilerEvent[] = [];

  setProfilerSink((event) => {
    profilerHistory.push(event);
    if (profilerHistory.length > PREVIEW_PROFILER_HISTORY_LIMIT) {
      profilerHistory.splice(0, profilerHistory.length - PREVIEW_PROFILER_HISTORY_LIMIT);
    }
    postPreviewMessage({ type: "profiler-event", event });
  });
  Profiler.event("preview.started", projectId);

  const previewGame: GameDefinition = {
    ...game,
    id: `editor-preview:${projectId}:${game.id}`,
    player: {
      ...game.player,
      storage: {
        prefix: "blackbox:editor-preview",
        migrateLegacy: false,
      },
      settings: {
        ...game.player?.settings,
        analytics: { available: false, defaultEnabled: false },
      },
    },
  };

  installPreviewHostCommands(profilerHistory, consoleHistory);

  configurePreviewLoader(async () => {
    Profiler.event("io.load", "preview documents", { projectId });
    const payload = await fetchPreviewDocs(apiBase, projectId);
    Profiler.event("io.loaded", "preview documents", {
      revision: payload.revision,
      chapters: payload.docs.chapters.length,
    });
    configurePreviewSource({
      apiBase,
      projectId,
      revision: payload.revision,
      docs: payload.docs,
    });
    subscribePreviewHotReload(apiBase, projectId);
    queueMicrotask(publishPreviewStorage);
  });

  bootGame(previewGame);
}

startPreviewPlayer();
