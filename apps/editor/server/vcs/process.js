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
    let settled = false;
    let timer = null;
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...options.env },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const wantsBuffer = options.encoding === "buffer";
    const stdoutChunks = [];
    let stdout = "";
    let stderr = "";
    if (!wantsBuffer) child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      if (wantsBuffer) stdoutChunks.push(chunk);
      else stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      callback();
    };
    if (options.timeoutMs > 0) {
      timer = setTimeout(() => {
        child.kill("SIGTERM");
        finish(() =>
          reject(
            new ProcessError(
              command,
              args,
              -1,
              stdout,
              stderr || `Timed out after ${options.timeoutMs}ms`,
            ),
          ),
        );
      }, options.timeoutMs);
    }
    child.once("error", (error) => finish(() => reject(error)));
    child.once("close", (code) => {
      finish(() => {
        if (code === 0 || options.allowFailure) {
          resolve({
            code: code ?? -1,
            stdout: wantsBuffer ? Buffer.concat(stdoutChunks) : stdout,
            stderr,
          });
          return;
        }
        reject(new ProcessError(command, args, code ?? -1, stdout, stderr));
      });
    });
  });
}
