import { DEV_MODE, LIVERELOAD_PORT } from "./config.js";

export function buildContentSecurityPolicy(devMode = DEV_MODE) {
  const scriptSrc = ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'"];
  if (devMode) {
    scriptSrc.push(`http://localhost:${LIVERELOAD_PORT}`);
  }

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    // 'self' allows the preview panel iframe; external sites cannot frame blackbox:// anyway.
    "frame-ancestors 'self'",
    "form-action 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "connect-src 'self'",
    "frame-src 'self'",
  ].join("; ");
}

export function registerSecurityHeaders(fastify, options = {}) {
  const policy = buildContentSecurityPolicy(options.devMode ?? DEV_MODE);
  fastify.addHook("onSend", async (_request, reply, payload) => {
    const type = reply.getHeader("content-type");
    if (typeof type === "string" && type.includes("text/html")) {
      reply.header("Content-Security-Policy", policy);
    }
    return payload;
  });
}
