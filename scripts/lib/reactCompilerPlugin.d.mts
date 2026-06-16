// Hand-written declaration for reactCompilerPlugin.mjs. Kept self-contained (no
// `rolldown`/`@babel/core` type imports) because scripts/lib has no node_modules of
// its own, so bare specifiers would not resolve when consumers typecheck this file.

interface ReactCompilerRolldownPlugin {
  name: string;
  transform(code: string, id: string): Promise<{ code: string; map: unknown } | null>;
}

interface ReactCompilerPluginDeps {
  /** The app-resolved `@babel/core` (only `transformAsync` is used). */
  babel: {
    transformAsync: (
      code: string,
      options?: object,
    ) => Promise<{ code?: string | null; map?: object | null } | null>;
  };
  /** The resolved `babel-plugin-react-compiler` (default export or interop-wrapped). */
  compilerPlugin: unknown;
}

export function reactCompilerPlugin(deps?: ReactCompilerPluginDeps): ReactCompilerRolldownPlugin;
