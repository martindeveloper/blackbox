import assert from "node:assert/strict";
import { test } from "node:test";
import { buildContentSecurityPolicy } from "./securityHeaders.js";

test("buildContentSecurityPolicy allows self-hosted assets and Google Fonts", () => {
  const policy = buildContentSecurityPolicy(false);
  assert.match(policy, /default-src 'self'/);
  assert.match(policy, /script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'/);
  assert.match(policy, /style-src 'self' 'unsafe-inline' https:\/\/fonts\.googleapis\.com/);
  assert.match(policy, /font-src 'self' https:\/\/fonts\.gstatic\.com data:/);
  assert.match(policy, /connect-src 'self'/);
  assert.match(policy, /frame-src 'self'/);
  assert.match(policy, /frame-ancestors 'self'/);
  assert.doesNotMatch(policy, /localhost/);
});

test("buildContentSecurityPolicy allows livereload in dev mode", () => {
  const policy = buildContentSecurityPolicy(true);
  assert.match(policy, /script-src[^;]*http:\/\/localhost:35730/);
});
