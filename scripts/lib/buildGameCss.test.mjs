import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { buildGameCss } from "./buildGameCss.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const WEB_ROOT = path.join(REPO_ROOT, "apps", "web");

test("buildGameCss prepends src/fonts.css before bundled rules", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "blackbox-build-css-"));
  const gameSrc = path.join(root, "game", "src");
  const outFile = path.join(root, "out", "style.css");

  await fs.mkdir(gameSrc, { recursive: true });
  await fs.writeFile(
    path.join(gameSrc, "fonts.css"),
    '@import url("https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap");\n',
  );
  await fs.writeFile(path.join(gameSrc, "app.css"), ":root { --game-accent: #f00; }\n");

  try {
    await buildGameCss({ webRoot: WEB_ROOT, gameSrc, outFile });
    const css = await fs.readFile(outFile, "utf8");
    const googleImport = css.indexOf("fonts.googleapis.com");
    assert.ok(googleImport >= 0, "expected Google Fonts import in output");
    assert.ok(googleImport < 500, "expected Google Fonts import near top of bundle");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

// The editor preview build passes an explicit requireFrom (deps root) and cacheDir
// (out-of-tree wrapper scratch). Exercise that shape so the two call sites can't
// silently diverge.
test("buildGameCss honors explicit requireFrom and cacheDir", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "blackbox-build-css-"));
  const gameSrc = path.join(root, "game", "src");
  const outFile = path.join(root, "out", "style.css");
  const cacheDir = path.join(root, "scratch", "tailwind");

  await fs.mkdir(gameSrc, { recursive: true });
  await fs.writeFile(path.join(gameSrc, "app.css"), ".game-marker { color: #0f0; }\n");

  try {
    await buildGameCss({
      webRoot: WEB_ROOT,
      gameSrc,
      outFile,
      requireFrom: path.join(WEB_ROOT, "package.json"),
      cacheDir,
    });
    const css = await fs.readFile(outFile, "utf8");
    assert.ok(css.includes(".game-marker"), "expected app.css rule in output");
    // Non-watch builds clean up the ephemeral wrapper they wrote into cacheDir.
    const leftovers = await fs.readdir(cacheDir).catch(() => []);
    assert.deepEqual(leftovers, [], "expected wrapper to be removed after build");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
