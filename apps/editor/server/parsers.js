export function commandResult(result) {
  return {
    ok: result.exitCode === 0,
    exitCode: result.exitCode,
    raw: { stdout: result.stdout, stderr: result.stderr },
  };
}

export function appendOutput(parts, label, result) {
  if (result.stdout) parts.push(result.stdout);
  if (!result.stdout && !result.stderr) {
    parts.push(`${label} exited with code ${result.exitCode}\n`);
  }
}

export function parseLint(stdout) {
  return parseJsonOutput(stdout);
}

function parseJsonOutput(stdout) {
  const trimmed = stdout.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function parseBundle(bundleStdout, inspectStdout, bundleStderr) {
  const bundleJson = parseJsonOutput(bundleStdout);
  const bundle = bundleJson?.written ?? null;
  const inspect = parseJsonOutput(inspectStdout);
  const stderrTrimmed = bundleStderr?.trim() || null;
  if (!bundle && !inspect) return null;
  return { kind: "bundle", bundle, bundleStderr: stderrTrimmed, inspect };
}

export function parseSimulator(stdout) {
  return parseJsonOutput(stdout);
}
