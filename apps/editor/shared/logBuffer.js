export const MAX_LOG_LINES = 5000;

export function appendLogLine(log, line) {
  log.push(line);
  if (log.length > MAX_LOG_LINES) {
    log.splice(0, log.length - MAX_LOG_LINES);
  }
}
