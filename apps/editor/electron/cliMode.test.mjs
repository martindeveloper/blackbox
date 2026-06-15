import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCliMode } from "./cliMode.mjs";

test("parseCliMode returns null without --cli", () => {
  assert.equal(parseCliMode(["/electron", "."]), null);
  assert.equal(parseCliMode(["/Applications/Blackbox Editor"]), null);
});

test("parseCliMode extracts args after --cli", () => {
  assert.deepEqual(parseCliMode(["/app", "--cli", "build", "--project=x"]), [
    "build",
    "--project=x",
  ]);
});

test("parseCliMode strips optional -- separator", () => {
  assert.deepEqual(parseCliMode(["/app", "--cli", "--", "build", "--platform=web"]), [
    "build",
    "--platform=web",
  ]);
});

test("parseCliMode skips dev app path", () => {
  assert.deepEqual(parseCliMode(["/electron", ".", "--cli", "--help"]), ["--help"]);
});
