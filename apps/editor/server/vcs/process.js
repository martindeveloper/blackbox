import { spawn } from "node:child_process";

export class ProcessError extends Error {
  constructor(command, args, code, stdout, stderr) {
    super(stderr.trim() || stdout.trim() || `${command} exited with code ${code}`);
    this.command = command;
    this.args = args;
    this.code = code;
    this.stdout = stdout;
    this.stderr = stderr;
  }
}

export function runProcess(command, args, cwd, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...options.env },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0 || options.allowFailure) {
        resolve({ code: code ?? -1, stdout, stderr });
        return;
      }
      reject(new ProcessError(command, args, code ?? -1, stdout, stderr));
    });
  });
}
