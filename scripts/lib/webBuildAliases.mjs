// STAGED: shared with the web build and run at runtime by the packaged editor's
// preview compiler — see scripts/lib/README.md and stage-shared-lib.mjs.
import path from "node:path";

const PLATFORMS = new Set(["web", "ios", "android"]);
const CONFIGURATIONS = new Set(["debug", "release"]);
const TARGETS = new Set(["player", "preview"]);

function assertOption(name, value, allowed) {
  if (!allowed.has(value)) {
    throw new Error(`invalid ${name} "${value}" — expected ${[...allowed].join(", ")}`);
  }
}

/**
 * Rolldown/tsconfig aliases for optional engine modules.
 *
 * Uses the same stub/full file-pair pattern as editor preview:
 * - `previewMode.stub.ts` / `previewMode.ts`
 * - `PreviewReporter.stub.tsx` / `PreviewReporter.tsx`
 * - `analytics.noop.ts` / `vercelAnalytics.ts`
 *
 * `@platform` is a compile-time constants module (platform × configuration matrix).
 */
export function resolveWebBuildAliases(
  webRoot,
  { platform = "web", configuration = "release", target = "player" } = {},
) {
  assertOption("platform", platform, PLATFORMS);
  assertOption("configuration", configuration, CONFIGURATIONS);
  assertOption("target", target, TARGETS);

  const engineLib = path.join(webRoot, "src", "engine", "lib");
  const previewSrc = path.join(webRoot, "src", "preview");
  const isPreview = target === "preview";
  const useVercelAnalytics = platform === "web" && !isPreview;

  return {
    "@platform": path.join(engineLib, `platform.${platform}.${configuration}.ts`),
    "@analytics": path.join(engineLib, useVercelAnalytics ? "vercelAnalytics.ts" : "analytics.noop.ts"),
    "@preview-mode": path.join(engineLib, isPreview ? "previewMode.ts" : "previewMode.stub.ts"),
    "@preview-reporter": path.join(
      previewSrc,
      isPreview ? "PreviewReporter.tsx" : "PreviewReporter.stub.tsx",
    ),
  };
}
