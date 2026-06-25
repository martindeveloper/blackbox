import fs from "node:fs/promises";
import path from "node:path";
import { VCS_OPERATION, VcsProvider } from "./provider.js";
import { ensureGitIgnore } from "./gitIgnore.js";
import { runProcess } from "./process.js";

const FIELD_SEPARATOR = "\x1f";
const RECORD_SEPARATOR = "\x1e";
const BACKGROUND_FETCH_TIMEOUT_MS = 20_000;
const MAX_TEXT_DIFF_BYTES = 512 * 1024;
const BINARY_EXTENSIONS = new Set([
  ".avif",
  ".bin",
  ".bmp",
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".m4a",
  ".mp3",
  ".mp4",
  ".ogg",
  ".otf",
  ".pdf",
  ".png",
  ".ttf",
  ".wav",
  ".webm",
  ".webp",
  ".woff",
  ".woff2",
]);

const normalizePath = (value) => value.replaceAll("\\", "/");

function isProbablyBinaryPath(filePath) {
  return BINARY_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function bufferLooksBinary(buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 8192));
  return sample.includes(0);
}

async function readSample(absolutePath) {
  const handle = await fs.open(absolutePath, "r");
  try {
    const buffer = Buffer.alloc(8192);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

async function readWorktreeFile(projectPath, filePath) {
  const absolute = path.join(projectPath, filePath);
  try {
    const stat = await fs.stat(absolute);
    if (!stat.isFile()) return { text: "", size: 0, binary: false, tooLarge: false };
    if (stat.size > MAX_TEXT_DIFF_BYTES || isProbablyBinaryPath(filePath)) {
      const sample = await readSample(absolute);
      return {
        text: "",
        size: stat.size,
        binary: isProbablyBinaryPath(filePath) || bufferLooksBinary(sample),
        tooLarge: stat.size > MAX_TEXT_DIFF_BYTES,
      };
    }
    const buffer = await fs.readFile(absolute);
    const binary = bufferLooksBinary(buffer);
    return {
      text: binary ? "" : buffer.toString("utf8"),
      size: stat.size,
      binary,
      tooLarge: false,
    };
  } catch {
    return { text: "", size: 0, binary: false, tooLarge: false };
  }
}

function parseBranchHeader(line, state) {
  if (line.startsWith("# branch.head ")) state.branch = line.slice(14);
  else if (line.startsWith("# branch.upstream ")) state.upstream = line.slice(18);
  else if (line.startsWith("# branch.ab ")) {
    const match = /\+(\d+)\s+-(\d+)/.exec(line);
    if (match) {
      state.ahead = Number(match[1]);
      state.behind = Number(match[2]);
    }
  }
}

function fileStatus(index, worktree) {
  if (index === "?" && worktree === "?") return "untracked";
  if (index === "U" || worktree === "U") return "conflicted";
  if (index === "A" || worktree === "A") return "added";
  if (index === "D" || worktree === "D") return "deleted";
  if (index === "R" || worktree === "R") return "renamed";
  return "modified";
}

export function parseGitStatus(output) {
  const state = { branch: null, upstream: null, ahead: 0, behind: 0, files: [] };
  const records = output.split("\0");
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record) continue;
    if (record.startsWith("# ")) {
      for (const line of record.split("\n")) parseBranchHeader(line, state);
      continue;
    }
    const kind = record[0];
    if (kind === "?") {
      state.files.push({
        path: normalizePath(record.slice(2)),
        status: "untracked",
        staged: false,
      });
      continue;
    }
    if (kind !== "1" && kind !== "2" && kind !== "u") continue;
    const fields = record.split(" ");
    const xy = fields[1] ?? "..";
    const pathOffset = kind === "1" ? 8 : kind === "2" ? 9 : 10;
    const filePath = fields.slice(pathOffset).join(" ");
    const originalPath = kind === "2" ? records[index + 1] : null;
    if (kind === "2") index += 1;
    const file = {
      path: normalizePath(filePath),
      status: fileStatus(xy[0], xy[1]),
      staged: xy[0] !== "." && xy[0] !== "?",
    };
    if (originalPath) file.originalPath = normalizePath(originalPath);
    state.files.push(file);
  }
  return {
    workspace: {
      label: state.branch,
      trackingLabel: state.upstream,
      ahead: state.ahead,
      behind: state.behind,
    },
    files: state.files.map(({ staged, ...file }) => ({
      ...file,
      stateLabel: staged ? "staged" : null,
    })),
  };
}

function parseHistory(output) {
  return output
    .split(RECORD_SEPARATOR)
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [hash, shortHash, authorName, authorEmail, authoredAt, subject] =
        record.split(FIELD_SEPARATOR);
      return {
        id: hash,
        shortId: shortHash,
        authorName,
        authorEmail,
        occurredAt: authoredAt,
        summary: subject,
      };
    });
}

async function git(projectPath, args, options) {
  return runProcess("git", ["-c", "core.quotepath=false", ...args], projectPath, options);
}

export class GitProvider extends VcsProvider {
  constructor() {
    super({
      id: "git",
      label: "Git",
      workflow: "distributed",
      operations: {
        sync: {
          label: "Pull",
          busyLabel: "Pulling…",
          successMessage: "Pull completed.",
          placement: "footer",
          scope: "workspace",
          changesWorkspace: true,
          requiresCleanEditor: true,
        },
        record: {
          label: "Commit all",
          busyLabel: "Committing…",
          successMessage: "Changes committed.",
          placement: "primary",
          scope: "changes",
          requiresMessage: true,
          messagePlaceholder: "Commit message",
          requiresChanges: true,
        },
        publish: {
          label: "Push",
          busyLabel: "Pushing…",
          successMessage: "Changes pushed.",
          placement: "footer",
          scope: "workspace",
          requiresCleanEditor: true,
        },
        revert: {
          label: "Discard changes",
          busyLabel: "Discarding…",
          successMessage: "Changes discarded.",
          placement: "file",
          scope: "selection",
          destructive: true,
          changesWorkspace: true,
          requiresChanges: true,
          requiresCleanEditor: true,
        },
      },
      features: {
        initialize: true,
        prepareMutation: true,
        history: true,
        diff: true,
        revert: true,
      },
    });
  }

  async availability() {
    try {
      const result = await runProcess("git", ["--version"], process.cwd(), { allowFailure: true });
      return {
        available: result.code === 0,
        version: result.code === 0 ? result.stdout.trim().replace(/^git version\s+/, "") : null,
      };
    } catch {
      return { available: false, version: null };
    }
  }

  async isRepository(projectPath) {
    const result = await git(projectPath, ["rev-parse", "--show-toplevel"], {
      allowFailure: true,
    });
    if (result.code !== 0) return false;
    try {
      const [repositoryRoot, candidateRoot] = await Promise.all([
        fs.realpath(path.resolve(result.stdout.trim())),
        fs.realpath(path.resolve(projectPath)),
      ]);
      return repositoryRoot === candidateRoot;
    } catch {
      return false;
    }
  }

  async initialize(projectPath) {
    await git(projectPath, ["init"]);
    await ensureGitIgnore(projectPath);
  }

  async prepareMutation(projectPath) {
    await ensureGitIgnore(projectPath);
  }

  async status(projectPath) {
    const status = parseGitStatus(
      (await git(projectPath, ["status", "--porcelain=v2", "--branch", "-z"])).stdout,
    );
    const remotes = (await git(projectPath, ["remote"])).stdout.split("\n").filter(Boolean);
    return {
      ...status,
      operationStates: {
        sync: {
          enabled: Boolean(status.workspace.trackingLabel),
          reason: status.workspace.trackingLabel ? null : "Set an upstream branch before pulling.",
        },
        record: { enabled: true, reason: null },
        revert: { enabled: true, reason: null },
        publish: {
          enabled: Boolean(status.workspace.trackingLabel) || remotes.length === 1,
          reason:
            status.workspace.trackingLabel || remotes.length === 1
              ? null
              : "Add a single remote or set an upstream branch before pushing.",
        },
      },
    };
  }

  async check(projectPath) {
    const remotes = (await git(projectPath, ["remote"])).stdout.split("\n").filter(Boolean);
    let fetchError = null;
    if (remotes.length > 0) {
      const result = await git(projectPath, ["fetch", "--all", "--prune", "--quiet"], {
        allowFailure: true,
        timeoutMs: BACKGROUND_FETCH_TIMEOUT_MS,
        env: {
          GIT_TERMINAL_PROMPT: "0",
          GIT_ASKPASS: "echo",
        },
      });
      if (result.code !== 0) fetchError = (result.stderr || result.stdout).trim();
    }
    const status = await this.status(projectPath);
    const behind = Number(status.workspace?.behind ?? 0);
    return {
      status,
      remote: {
        hasChanges: behind > 0,
        changeCount: behind,
        label: status.workspace?.trackingLabel ?? remotes[0] ?? null,
        behind,
        checkFailed: Boolean(fetchError),
        reason: fetchError,
      },
    };
  }

  async sync(projectPath) {
    const before = (await git(projectPath, ["rev-parse", "HEAD"])).stdout.trim();
    await git(projectPath, ["pull", "--ff-only"]);
    const after = (await git(projectPath, ["rev-parse", "HEAD"])).stdout.trim();
    const changedPaths =
      before === after
        ? []
        : (await git(projectPath, ["diff", "--name-only", "-z", before, after])).stdout
            .split("\0")
            .filter(Boolean)
            .map(normalizePath);
    return { before, after, changedPaths };
  }

  async record(projectPath, message, paths) {
    await git(projectPath, ["add", "--all", "--", ...paths]);
    await git(projectPath, ["commit", "-m", message, "--", ...paths]);
    const [revision] = await this.history(projectPath, { limit: 1 });
    return { revision };
  }

  async publish(projectPath) {
    const upstream = await git(
      projectPath,
      ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
      { allowFailure: true },
    );
    let args = ["push"];
    if (upstream.code !== 0) {
      const remotes = (await git(projectPath, ["remote"])).stdout.split("\n").filter(Boolean);
      const branch = (await git(projectPath, ["branch", "--show-current"])).stdout.trim();
      if (remotes.length === 1 && branch) args = ["push", "--set-upstream", remotes[0], branch];
    }
    const result = await git(projectPath, args);
    return { output: (result.stdout || result.stderr).trim() };
  }

  async revert(projectPath, paths) {
    const targets = (paths ?? []).filter(Boolean);
    if (targets.length === 0) return { changedPaths: [] };
    // Unstage everything first, then restore each tracked file to HEAD
    // (per-path so an untracked sibling can't abort the whole checkout), and
    // finally remove any untracked leftovers among the targets.
    await git(projectPath, ["reset", "--quiet", "--", ...targets], { allowFailure: true });
    for (const target of targets) {
      await git(projectPath, ["checkout", "HEAD", "--", target], { allowFailure: true });
    }
    await git(projectPath, ["clean", "-fd", "--", ...targets], { allowFailure: true });
    return { changedPaths: targets.map(normalizePath) };
  }

  async execute(operation, projectPath, context = {}) {
    if (operation === VCS_OPERATION.SYNC) return this.sync(projectPath);
    if (operation === VCS_OPERATION.RECORD) {
      return this.record(projectPath, context.message, context.paths);
    }
    if (operation === VCS_OPERATION.PUBLISH) return this.publish(projectPath);
    if (operation === VCS_OPERATION.REVERT) return this.revert(projectPath, context.paths);
    throw new Error(`Unsupported Git operation: ${operation}`);
  }

  async history(projectPath, { path = null, limit = 50 } = {}) {
    const format = ["%H", "%h", "%an", "%ae", "%aI", "%s"].join(FIELD_SEPARATOR) + RECORD_SEPARATOR;
    const args = ["log", `--max-count=${limit}`, `--pretty=format:${format}`];
    if (path) args.push("--", path);
    const result = await git(projectPath, args, { allowFailure: true });
    return result.code === 0 ? parseHistory(result.stdout) : [];
  }

  async diff(projectPath, filePath) {
    const [status, beforeSizeResult, afterFile] = await Promise.all([
      this.status(projectPath),
      git(projectPath, ["cat-file", "-s", `HEAD:${filePath}`], { allowFailure: true }),
      readWorktreeFile(projectPath, filePath),
    ]);
    const beforeSize =
      beforeSizeResult.code === 0 ? Number.parseInt(beforeSizeResult.stdout.trim(), 10) : 0;
    const binary = afterFile.binary || isProbablyBinaryPath(filePath);
    const tooLarge =
      afterFile.tooLarge || (Number.isFinite(beforeSize) && beforeSize > MAX_TEXT_DIFF_BYTES);
    const diffable = !binary && !tooLarge;
    const beforeResult = diffable
      ? await git(projectPath, ["show", `HEAD:${filePath}`], { allowFailure: true })
      : { code: beforeSizeResult.code, stdout: "" };
    return {
      path: filePath,
      diffable,
      binary,
      tooLarge,
      beforeSize: Number.isFinite(beforeSize) ? beforeSize : 0,
      afterSize: afterFile.size,
      before: beforeResult.code === 0 ? beforeResult.stdout : "",
      after: diffable ? afterFile.text : "",
      status: status.files.find((file) => file.path === filePath) ?? null,
    };
  }
}
