import type { BlackboxEngine as WasmBlackboxEngine } from "@wasm-module";
import type { LogLevel } from "./logger.js";

export type BlackboxEngine = WasmBlackboxEngine;

type WasmPkg = typeof import("@wasm-module");

let wasmPkg: WasmPkg | null = null;
let initPromise: Promise<void> | null = null;

export function requireWasmPkg(): WasmPkg {
  if (!wasmPkg) {
    throw new Error("WASM module not initialized — call initWasm() first");
  }
  return wasmPkg;
}

export async function initWasm(): Promise<void> {
  if (wasmPkg) return;
  if (initPromise) {
    await initPromise;
    return;
  }

  initPromise = (async () => {
    // @ts-expect-error — /pkg/ is served at runtime by the dev server/build output
    const pkg = await (import("/pkg/blackbox_wasm.js") as Promise<WasmPkg>);
    wasmPkg = pkg;
    await pkg.default();
  })();

  try {
    await initPromise;
  } catch (error) {
    initPromise = null;
    throw error;
  }
}

export function setWasmLogLevel(level: LogLevel): void {
  requireWasmPkg().setWasmLogLevel(level);
}
