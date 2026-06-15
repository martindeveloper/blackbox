import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { resolveWebBuildAliases } from "./webBuildAliases.mjs";

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../apps/web");

test("player web uses real analytics and preview stubs", () => {
  const aliases = resolveWebBuildAliases(WEB_ROOT, {
    platform: "web",
    configuration: "release",
    target: "player",
  });
  assert.match(aliases["@platform"], /platform\.web\.release\.ts$/);
  assert.match(aliases["@analytics"], /vercelAnalytics\.ts$/);
  assert.match(aliases["@preview-mode"], /previewMode\.stub\.ts$/);
  assert.match(aliases["@preview-reporter"], /PreviewReporter\.stub\.tsx$/);
});

test("player native uses analytics noop and native platform constants", () => {
  const aliases = resolveWebBuildAliases(WEB_ROOT, {
    platform: "android",
    configuration: "debug",
    target: "player",
  });
  assert.match(aliases["@platform"], /platform\.android\.debug\.ts$/);
  assert.match(aliases["@analytics"], /analytics\.noop\.ts$/);
});

test("editor preview uses preview modules and analytics noop on web", () => {
  const aliases = resolveWebBuildAliases(WEB_ROOT, {
    platform: "web",
    configuration: "debug",
    target: "preview",
  });
  assert.match(aliases["@platform"], /platform\.web\.debug\.ts$/);
  assert.match(aliases["@analytics"], /analytics\.noop\.ts$/);
  assert.match(aliases["@preview-mode"], /previewMode\.ts$/);
  assert.match(aliases["@preview-reporter"], /PreviewReporter\.tsx$/);
});
