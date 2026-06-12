#!/usr/bin/env node
// Symbolize wasm-function[N]:0xOFFSET lines from the browser console.

import { existsSync, mkdtempSync, readFileSync, unlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { commandExists, capture, runSync } from "../../../scripts/lib/spawn.mjs";
import { repoRootFrom } from "../../../scripts/lib/paths.mjs";

const hasWabt = () => commandExists("wasm-objdump") && commandExists("wasm-decompile");
const hasWasmTools = () => commandExists("wasm-tools");

if (!hasWabt() && !hasWasmTools()) {
  console.error(
    "error: install wabt (wasm-objdump, wasm-decompile) and/or wasm-tools (cargo install wasm-tools)",
  );
  process.exit(1);
}

const argv = process.argv.slice(2);
if (argv.length < 2) {
  console.error("usage: node wasm-stack.mjs <blackbox_wasm_bg.wasm> <func-index>...");
  console.error("       node wasm-stack.mjs <blackbox_wasm_bg.wasm> --from-log <console.txt>");
  process.exit(1);
}

const wasmPath = path.resolve(argv[0]);
if (!existsSync(wasmPath)) {
  console.error(`error: wasm file not found: ${wasmPath}`);
  process.exit(1);
}

const repoRoot = repoRootFrom(import.meta.url, 3);
const symbolWasm = path.join(
  repoRoot,
  ".cache/target/wasm32-unknown-unknown/debug/blackbox_wasm.wasm",
);

let indices = [];
let offsets = new Map();
const cleanup = [];

if (argv[1] === "--from-log") {
  const logPath = argv[2];
  if (!logPath) {
    console.error("error: log file path required with --from-log");
    process.exit(1);
  }
  const log = readFileSync(logPath, "utf8");
  const indexMatches = [...log.matchAll(/wasm-function\[([0-9]+)\]/g)].map((m) => m[1]);
  indices = [...new Set(indexMatches)];
  for (const match of log.matchAll(/wasm-function\[([0-9]+)\]:0x([0-9a-fA-F]+)/g)) {
    offsets.set(match[1], match[2]);
  }
} else {
  indices = argv.slice(1);
}

if (indices.length === 0) {
  console.error("error: no wasm-function[N] indices found");
  process.exit(1);
}

let decompilePath = "";
if (hasWabt()) {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "blackbox-decompile-"));
  decompilePath = path.join(tmpDir, "decompiled.c");
  cleanup.push(decompilePath);
  console.log(`==> decompiling ${path.basename(wasmPath)} (wabt)…`);
  runSync("wasm-decompile", [wasmPath, "-o", decompilePath], { quiet: true });
}

console.log(`==> ${path.basename(wasmPath)}`);
if (hasWabt()) {
  try {
    const output = capture("wasm-objdump", ["-x", wasmPath], { quiet: true });
    for (const line of output.split("\n")) {
      if (line.includes("blackboxengine_")) {
        console.log(line);
      }
    }
  } catch {
    // optional diagnostics
  }
} else if (hasWasmTools()) {
  try {
    const output = capture("wasm-tools", ["objdump", wasmPath], { quiet: true });
    for (const line of output.split("\n")) {
      if (line.includes("exports")) {
        console.log(line);
      }
    }
  } catch {
    // optional diagnostics
  }
}
console.log();

if (hasWasmTools()) {
  try {
    const headers = capture("wasm-objdump", ["-h", wasmPath], { quiet: true });
    if (/\.debug_info/.test(headers)) {
      console.log("==> DWARF: present in browser wasm");
    } else {
      console.log("==> DWARF: not in browser wasm (wasm-opt strips it)");
      try {
        const symbolHeaders = capture("wasm-objdump", ["-h", symbolWasm], { quiet: true });
        if (/\.debug_info/.test(symbolHeaders)) {
          console.log(`    source lines: ${symbolWasm}`);
          console.log("    (func indices differ — offsets are browser-wasm only)");
        } else {
          console.log("    run: node ./scripts/build-wasm-symbols.mjs");
        }
      } catch {
        console.log("    run: node ./scripts/build-wasm-symbols.mjs");
      }
    }
  } catch {
    // optional diagnostics
  }
  console.log();
}

console.log("==> embedded panic strings");
try {
  const wasmText = readFileSync(wasmPath);
  const pattern = /library\/(alloc|std)\/src\/|engine\/|RefCell|mutex|assert_unchecked|unwrap\(\)/g;
  const hits = new Set();
  for (const match of wasmText.toString("latin1").matchAll(pattern)) {
    hits.add(match[0]);
  }
  [...hits]
    .sort()
    .slice(0, 20)
    .forEach((hit) => console.log(hit));
} catch {
  // strings extraction is best-effort
}
console.log();

function frameOffsetFor(index) {
  return offsets.get(index) ?? "";
}

function funcCodeBase(index) {
  if (!hasWabt()) {
    return "";
  }
  try {
    const disasm = capture("wasm-objdump", ["-d", wasmPath], { quiet: true });
    const line = disasm
      .split("\n")
      .find((entry) => new RegExp(`^[0-9a-f]+ func\\[${index}\\]`).test(entry));
    return line?.split(/\s+/)[0] ?? "";
  } catch {
    return "";
  }
}

for (const idx of indices) {
  console.log(`==> func[${idx}]`);
  if (hasWabt()) {
    try {
      const output = capture("wasm-objdump", ["-x", wasmPath], { quiet: true });
      output
        .split("\n")
        .filter((line) => line.includes(`func[${idx}]`))
        .slice(0, 3)
        .forEach((line) => console.log(line));
    } catch {
      // optional diagnostics
    }
    if (decompilePath) {
      try {
        const decompiled = readFileSync(decompilePath, "utf8");
        const anchor = decompiled
          .split("\n")
          .findIndex((line) => new RegExp(`// func${idx}\\b`).test(line));
        if (anchor >= 0) {
          console.log(`${anchor + 1}:${decompiled.split("\n")[anchor]}`);
        } else {
          console.log("  (no decompile anchor)");
        }
      } catch {
        console.log("  (no decompile anchor)");
      }
    }
  } else if (hasWasmTools()) {
    try {
      const printed = capture("wasm-tools", ["print", wasmPath], { quiet: true });
      const funcLine = printed.split("\n").filter((line) => /func \$/.test(line))[Number(idx)];
      if (funcLine) {
        console.log(funcLine);
      }
    } catch {
      // optional diagnostics
    }
  }

  const offset = frameOffsetFor(idx);
  if (offset) {
    console.log(`  frame offset: 0x${offset}`);
    const base = funcCodeBase(idx);
    if (base) {
      const codeAddr = Number.parseInt(base, 16) + Number.parseInt(offset, 16);
      console.log(`  code-section addr: 0x${codeAddr.toString(16)} (base 0x${base} + 0x${offset})`);
      if (hasWasmTools()) {
        try {
          const symbolHeaders = capture("wasm-objdump", ["-h", symbolWasm], { quiet: true });
          if (/\.debug_info/.test(symbolHeaders)) {
            console.log("  addr2line (symbol wasm — indices may not match):");
            const lines = capture(
              "wasm-tools",
              ["addr2line", "--code-section-relative", symbolWasm, `@${codeAddr.toString(16)}`],
              { quiet: true },
            );
            for (const line of lines.split("\n")) {
              if (line) {
                console.log(`    ${line}`);
              }
            }
          }
        } catch {
          // optional diagnostics
        }
      }
    }
  }
  console.log();
}

for (const file of cleanup) {
  try {
    unlinkSync(file);
  } catch {
    // ignore cleanup errors
  }
}
