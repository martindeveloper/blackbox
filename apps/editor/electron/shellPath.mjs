import { spawnSync } from "node:child_process";

/**
 * macOS GUI apps (including the dev Electron .app bundle) often inherit a stripped PATH
 * that omits Homebrew, rbenv, and gem bins — so `pod` exists in Terminal but not here.
 * Resolve the user's login-shell PATH once at startup.
 */
export function applyDarwinShellPath() {
  if (process.platform !== "darwin") return;

  const shell = process.env.SHELL;
  if (!shell) return;

  const result = spawnSync(shell, ["-ilc", "echo -n $PATH"], {
    encoding: "utf8",
    env: { ...process.env, TERM: "dumb" },
  });
  const resolved = result.stdout?.trim();
  if (result.status === 0 && resolved) {
    process.env.PATH = resolved;
  }
}
