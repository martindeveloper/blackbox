import { highlightShell } from "@/lib/shellHighlight";

type ShellPlatform = "macos" | "windows";
type ShellLang = "bash" | "powershell";

function MacWindowChrome({ filename }: { filename: string }) {
  return (
    <>
      <span className="snippet-dot" />
      <span className="snippet-dot" />
      <span className="snippet-dot" />
      <span className="snippet-filename">{filename}</span>
    </>
  );
}

function WindowsWindowChrome({ filename }: { filename: string }) {
  return (
    <>
      <span className="snippet-filename">{filename}</span>
      <div className="snippet-win-controls" aria-hidden="true">
        <span className="snippet-win-btn snippet-win-btn--min" />
        <span className="snippet-win-btn snippet-win-btn--max" />
        <span className="snippet-win-btn snippet-win-btn--close" />
      </div>
    </>
  );
}

export function shellLangForPlatform(platform: ShellPlatform): ShellLang {
  return platform === "windows" ? "powershell" : "bash";
}

export function shellFilenameForPlatform(platform: ShellPlatform): string {
  return platform === "windows" ? "Windows PowerShell" : "Terminal";
}

export function formatShellCommandsForPlatform(commands: string, platform: ShellPlatform): string {
  if (platform !== "windows") {
    return commands;
  }

  return commands.replace(/\\(\s*)$/gm, "`$1");
}

export function ShellCodeBlock({
  platform,
  filename = shellFilenameForPlatform(platform),
  commands,
  lang = shellLangForPlatform(platform),
  className,
}: {
  platform: ShellPlatform;
  filename?: string;
  commands: string;
  lang?: ShellLang;
  className?: string;
}) {
  const isWindows = platform === "windows";
  const classes = [
    "snippet-code-wrap",
    isWindows ? "snippet-code-wrap--win" : "snippet-code-wrap--mac",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes}>
      <div
        className={`snippet-code-bar${isWindows ? " snippet-code-bar--win" : " snippet-code-bar--mac"}`}
      >
        {isWindows ? (
          <WindowsWindowChrome filename={filename} />
        ) : (
          <MacWindowChrome filename={filename} />
        )}
      </div>
      <pre className="snippet-code">
        <code>{highlightShell(commands, lang)}</code>
      </pre>
    </div>
  );
}
