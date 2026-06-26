// Public-surface contract test for @engine/sdk/v1.
//
// Snapshots the FULLY-RESOLVED public API of every SDK v1 module (export names, value
// signatures, and one-level-expanded type shapes) into a golden file. CI fails when the
// snapshot drifts, so an internal change that leaks through an SDK v1 export - a renamed field
// on GameView, a changed signature, a different inferred return - is caught here instead
// of in a game. Run with --update to intentionally accept a new surface.
//
//   node scripts/check-sdk-api.mjs            # verify against the golden (CI)
//   node scripts/check-sdk-api.mjs --update   # rewrite the golden after an intended change
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(webRoot, "package.json"));
const ts = require("typescript");

const SDK_V1_DIR = path.join(webRoot, "src", "engine", "sdk", "v1");
const GOLDEN = path.join(SDK_V1_DIR, "api-surface.snap");

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

// Repo-relative, machine-independent rendering of `import("/abs/path").Name`.
function normalize(text) {
  return text.replace(/import\("([^"]+)"\)/g, (_m, p) => {
    const marker = "/src/engine/";
    const rel = p.includes(marker) ? p.slice(p.indexOf(marker) + marker.length) : path.basename(p);
    return `import("${rel.replace(/\.(ts|tsx|js|jsx|d\.ts)$/, "")}")`;
  });
}

function normalizeSnapshot(text) {
  return text.replace(/\r\n?/g, "\n");
}

const FORMAT_FLAGS =
  ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.WriteTypeArgumentsOfSignature;

// Library / built-in types (Map, Array, Promise, ...) must not be member-dumped: their
// shapes carry unstable synthetic symbol ids and belong to the TS lib, not our surface.
function isLibType(type) {
  const sym = type.getSymbol() ?? type.aliasSymbol;
  const decl = sym?.declarations?.[0];
  if (!decl) return false;
  const file = decl.getSourceFile().fileName;
  return file.includes("node_modules") || /lib\.[^/]*\.d\.ts$/.test(file);
}

function buildProgram() {
  const configPath = path.join(webRoot, "tsconfig.game.json");
  const host = {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (d) => {
      throw new Error(ts.flattenDiagnosticMessageText(d.messageText, "\n"));
    },
  };
  const cmd = ts.getParsedCommandLineOfConfigFile(configPath, {}, host);
  const files = walk(SDK_V1_DIR).sort();
  const program = ts.createProgram(files, { ...cmd.options, noEmit: true });
  return { program, files };
}

function isPlainObjectType(checker, type) {
  if (type.getCallSignatures().length > 0) return false;
  if (type.isUnionOrIntersection()) return false;
  if (isLibType(type)) return false;
  if (type.flags & ts.TypeFlags.Object) return checker.getPropertiesOfType(type).length > 0;
  return false;
}

function renderType(checker, type, location) {
  if (isPlainObjectType(checker, type)) {
    const props = checker
      .getPropertiesOfType(type)
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
    const lines = props.map((p) => {
      const decl = p.valueDeclaration ?? p.declarations?.[0] ?? location;
      const pt = checker.getTypeOfSymbolAtLocation(p, decl);
      const optional = p.flags & ts.SymbolFlags.Optional ? "?" : "";
      const readonly = checker.isReadonlySymbol?.(p) ? "readonly " : "";
      return `  ${readonly}${p.name}${optional}: ${normalize(checker.typeToString(pt, decl, FORMAT_FLAGS))};`;
    });
    return `{\n${lines.join("\n")}\n}`;
  }
  return normalize(checker.typeToString(type, location, FORMAT_FLAGS));
}

function snapshot() {
  const { program, files } = buildProgram();
  const checker = program.getTypeChecker();
  const sections = [];

  for (const file of files) {
    const sf = program.getSourceFile(file);
    if (!sf) continue;
    const moduleSym = checker.getSymbolAtLocation(sf);
    if (!moduleSym) continue;
    const rel = path.relative(SDK_V1_DIR, file).split(path.sep).join("/");
    const exports = checker
      .getExportsOfModule(moduleSym)
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));

    const entries = [];
    for (const sym of exports) {
      const isType = sym.flags & (ts.SymbolFlags.Type | ts.SymbolFlags.TypeAlias);
      const isValue =
        sym.flags & (ts.SymbolFlags.Function | ts.SymbolFlags.Variable | ts.SymbolFlags.Class);
      if (isType) {
        const t = checker.getDeclaredTypeOfSymbol(sym);
        entries.push(`type ${sym.name} = ${renderType(checker, t, sf)};`);
      }
      if (isValue) {
        const decl = sym.valueDeclaration ?? sym.declarations?.[0] ?? sf;
        const t = checker.getTypeOfSymbolAtLocation(sym, decl);
        entries.push(`const ${sym.name}: ${renderType(checker, t, sf)};`);
      }
    }
    sections.push(`// ${rel}\n${entries.join("\n")}`);
  }

  return `${sections.join("\n\n")}\n`;
}

const update = process.argv.includes("--update");
const next = snapshot();

if (update) {
  fs.writeFileSync(GOLDEN, next);
  console.log(`Updated SDK v1 API snapshot (${GOLDEN}).`);
  process.exit(0);
}

const prev = fs.existsSync(GOLDEN) ? fs.readFileSync(GOLDEN, "utf8") : "";
const prevNormalized = normalizeSnapshot(prev);
const nextNormalized = normalizeSnapshot(next);
if (prevNormalized === nextNormalized) {
  console.log("SDK v1 API surface matches the snapshot.");
  process.exit(0);
}

console.error(
  "SDK v1 API surface changed. If this is intentional, run:\n  npm run check:api -- --update\n",
);
// Minimal line diff for the failure output.
const a = prevNormalized.split("\n");
const b = nextNormalized.split("\n");
const max = Math.max(a.length, b.length);
for (let i = 0; i < max; i++) {
  if (a[i] !== b[i]) {
    if (a[i] !== undefined) console.error(`- ${a[i]}`);
    if (b[i] !== undefined) console.error(`+ ${b[i]}`);
  }
}
process.exit(1);
