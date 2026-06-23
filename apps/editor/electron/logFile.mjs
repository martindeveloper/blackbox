import fs from "node:fs";
import path from "node:path";

// The packaged editor (notably the MSIX build) is launched without an attached
// console, and the Fastify server runs with logging disabled, so every console.*
// call and any error written to stderr would otherwise vanish. We tee both standard
// streams to a file under userData/logs so failures like a preview build error are
// recoverable after the fact. The server process forwards its output through these
// streams (serverProcess.mjs), so its logs land here too.

let stream = null;

function tee(target) {
  const original = target.write.bind(target);
  target.write = (chunk, encoding, callback) => {
    try {
      stream?.write(chunk);
    } catch {}
    return original(chunk, encoding, callback);
  };
}

export function initFileLogging(userDataDir) {
  if (stream) return null;
  const logsDir = path.join(userDataDir, "logs");
  fs.mkdirSync(logsDir, { recursive: true });
  const logPath = path.join(logsDir, "editor.log");

  // Keep the previous session for comparison; uncaught exceptions print to
  // stderr by default, so teeing the streams captures crashes without us
  // installing handlers that would alter the default crash behavior.
  try {
    if (fs.existsSync(logPath)) {
      fs.rmSync(path.join(logsDir, "editor.log.old"), { force: true });
      fs.renameSync(logPath, path.join(logsDir, "editor.log.old"));
    }
  } catch {}

  stream = fs.createWriteStream(logPath, { flags: "a" });
  stream.write(`--- editor session started ${new Date().toISOString()} ---\n`);

  tee(process.stdout);
  tee(process.stderr);

  return logPath;
}
