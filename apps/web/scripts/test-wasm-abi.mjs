#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveWebWwwDir } from "./lib/adventureDev.mjs";

const clientRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(clientRoot, "../..");
const bundleDir = join(resolveWebWwwDir(process.env), "bundle");
const wasmPkgDir = join(repoRoot, ".cache/wasm/clients-web");
const BOX_HEADER_SIZE = 16;

function readBundleEntry(box, entry) {
  const start = BOX_HEADER_SIZE + entry.offset;
  return new Uint8Array(box.slice(start, start + entry.length));
}

function loadBundlePart(metaName, blobName) {
  const map = JSON.parse(readFileSync(join(bundleDir, metaName), "utf8"));
  const box = readFileSync(join(bundleDir, blobName));
  return { map, box };
}

function readPath(parts, path) {
  for (const { map, box } of parts) {
    const entry = map.entries[path];
    if (entry) return readBundleEntry(box, entry);
  }
  throw new Error(`Missing bundle entry: ${path}`);
}

const shared = loadBundlePart("shared.box.meta", "shared.box");
const chapel = loadBundlePart("chapel.box.meta", "chapel.box");
const parts = [shared, chapel];

const scenario = readPath(parts, "content/scenario");
const items = readPath(parts, "content/items");
const characters = readPath(parts, "content/characters");
const assets = readPath(parts, "content/assets");
const library = readPath(parts, "content/library");
const chapters = [readPath(parts, "content/chapters/chapel")];

const wasm = await import(join(wasmPkgDir, "blackbox_wasm.js"));
const wasmBytes = new Uint8Array(readFileSync(join(wasmPkgDir, "blackbox_wasm_bg.wasm")));
await wasm.default({ module_or_path: wasmBytes });

const engine = new wasm.BlackboxEngine(scenario, items, characters, assets, chapters, library);

const initial = JSON.parse(engine.get_current_view());
if (initial.protocol !== 1 || initial.revision !== 0 || initial.view?.player_stats?.hp !== 10) {
  throw new Error(`invalid initial snapshot: ${JSON.stringify(initial)}`);
}

const touchJson = engine.submit_command(
  JSON.stringify({ type: "choose", choice_id: "touch_the_server_rack" }),
  initial.revision,
);
const touch = JSON.parse(touchJson);
if (!touch.ok) throw new Error(`touch failed: ${JSON.stringify(touch)}`);
if (touch.view || touch.delta?.player_stats?.hp !== 8) {
  throw new Error(`touch did not return an HP delta: ${JSON.stringify(touch)}`);
}
const afterTouch = JSON.parse(engine.get_current_view());
const touchFullEquivalentBytes = JSON.stringify({
  ok: true,
  view: afterTouch.view,
  selectedSfx: touch.selectedSfx,
}).length;
const savedAfterTouch = engine.serialize_state();

const staleAsk = JSON.parse(
  engine.submit_command(
    JSON.stringify({ type: "choose", choice_id: "ask_what_it_prays_to" }),
    initial.revision,
  ),
);
if (staleAsk.error?.type !== "viewRevisionMismatch") {
  throw new Error(`stale command was not rejected: ${JSON.stringify(staleAsk)}`);
}

const askJson = engine.submit_command(
  JSON.stringify({ type: "choose", choice_id: "ask_what_it_prays_to" }),
  touch.revision,
);
const ask = JSON.parse(askJson);
if (!ask.ok) throw new Error(`ask failed: ${JSON.stringify(ask)}`);
if (ask.delta?.node_id !== "android_chapel_prayer_first_answer") {
  throw new Error(`ask did not return the expected node delta: ${JSON.stringify(ask)}`);
}

const current = JSON.parse(engine.get_current_view());
if (
  current.view?.node_id !== "android_chapel_prayer_first_answer" ||
  current.view?.player_stats?.hp !== 8 ||
  current.view?.events?.length !== 0
) {
  throw new Error(`stale command mutated engine state: ${JSON.stringify(current)}`);
}

const restored = JSON.parse(engine.restore_state(savedAfterTouch));
if (
  restored.protocol !== 1 ||
  restored.revision !== current.revision + 1 ||
  restored.view?.node_id !== "android_chapel_intro" ||
  restored.view?.player_stats?.hp !== 8
) {
  throw new Error(`restore did not reset the view snapshot: ${JSON.stringify(restored)}`);
}

const askFullEquivalentBytes = JSON.stringify({
  ok: true,
  view: current.view,
  selectedSfx: ask.selectedSfx,
}).length;

console.log("ok", {
  touchDeltaBytes: touchJson.length,
  askDeltaBytes: askJson.length,
  touchFullEquivalentBytes,
  askFullEquivalentBytes,
  touchReduction: `${Math.round((1 - touchJson.length / touchFullEquivalentBytes) * 100)}%`,
  askReduction: `${Math.round((1 - askJson.length / askFullEquivalentBytes) * 100)}%`,
});
