import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export async function moveToOsTrash(target) {
  if (process.platform === "darwin") {
    const script = [
      "on run argv",
      'tell application "Finder" to delete POSIX file (item 1 of argv)',
      "end run",
    ].join("\n");
    await run("osascript", ["-e", script, target]);
    return;
  }

  if (process.platform === "win32") {
    const script = [
      "Add-Type -AssemblyName Microsoft.VisualBasic",
      "[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory(",
      "  $args[0],",
      "  [Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs,",
      "  [Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin",
      ")",
    ].join("\n");
    await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script, target]);
    return;
  }

  await run("gio", ["trash", "--", target]);
}
