// Shared Rolldown plugin that runs the React Compiler (babel-plugin-react-compiler)
// over app source, injecting auto-memoization. Babel only runs the compiler pass:
// it parses TSX/JSX and re-emits with JSX and type syntax preserved, leaving the
// actual lowering to Rolldown's oxc transform. So oxc stays the source of truth and
// Babel's only job is the memoization rewrite.
//
// Babel can't be imported here (scripts/lib has no node_modules of its own), so each
// app's rolldown config injects its locally-resolved `@babel/core` and the compiler
// plugin. React 19 ships `react/compiler-runtime`, so no runtime dep is needed.

const FILTER = /\.[cm]?[jt]sx?$/;
const EXCLUDE = /[\\/]node_modules[\\/]/;

function parserPluginsFor(id) {
  const jsx = id.endsWith("x");
  const plugins = jsx ? ["jsx"] : [];
  if (/\.[cm]?tsx?$/.test(id)) plugins.push(["typescript", { isTSX: jsx }]);
  return plugins;
}

export function reactCompilerPlugin({ babel, compilerPlugin } = {}) {
  if (!babel?.transformAsync) {
    throw new Error("reactCompilerPlugin: a `babel` instance with transformAsync is required");
  }
  // The compiler plugin is CJS; under ESM interop it may arrive wrapped in `.default`.
  const plugin = compilerPlugin?.default ?? compilerPlugin;
  if (typeof plugin !== "function") {
    throw new Error("reactCompilerPlugin: `compilerPlugin` (babel-plugin-react-compiler) required");
  }

  return {
    name: "react-compiler",
    async transform(code, id) {
      if (EXCLUDE.test(id) || !FILTER.test(id)) return null;
      const result = await babel.transformAsync(code, {
        filename: id,
        babelrc: false,
        configFile: false,
        browserslistConfigFile: false,
        sourceType: "module",
        sourceMaps: true,
        parserOpts: { plugins: parserPluginsFor(id) },
        plugins: [[plugin, { target: "19" }]],
      });
      return result?.code ? { code: result.code, map: result.map } : null;
    },
  };
}
