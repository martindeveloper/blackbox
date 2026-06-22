import type { PreviewCheckpointPayload, PreviewHostCommand } from "@players/web/protocol.js";
import { PreviewCommandError } from "./previewCommandErrors.js";

export type PreviewCommandSender = (command: PreviewHostCommand) => void;

export type PreviewRpcCommand = Extract<
  PreviewHostCommand,
  { type: "capture-checkpoint" } | { type: "restore-checkpoint" }
>;

type RpcCommandType = PreviewRpcCommand["type"];

type RpcResultType = "checkpoint-capture-result" | "checkpoint-restore-result";

export type PreviewRpcSuccess<T extends RpcCommandType> = T extends "capture-checkpoint"
  ? PreviewCheckpointPayload
  : void;

type RpcCaptureResult = {
  type: "checkpoint-capture-result";
  ok: boolean;
  message?: string;
  checkpoint?: PreviewCheckpointPayload;
};

type RpcRestoreResult = {
  type: "checkpoint-restore-result";
  ok: boolean;
  message?: string;
};

type RpcResult = RpcCaptureResult | RpcRestoreResult;

interface PendingPreviewCommand {
  kind: RpcCommandType;
  resolve: (value: PreviewCheckpointPayload | undefined) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

const PREVIEW_COMMAND_TIMEOUT_MS = 8000;

const RPC_SPECS = {
  "capture-checkpoint": {
    resultType: "checkpoint-capture-result" as const,
    failMessage: "Checkpoint could not be captured.",
    settle(pending: PendingPreviewCommand, result: RpcCaptureResult) {
      if (result.ok && result.checkpoint) {
        pending.resolve(result.checkpoint);
        return;
      }
      pending.reject(new PreviewCommandError("failed", result.message ?? this.failMessage));
    },
  },
  "restore-checkpoint": {
    resultType: "checkpoint-restore-result" as const,
    failMessage: "Checkpoint could not be restored.",
    settle(pending: PendingPreviewCommand, result: RpcRestoreResult) {
      if (result.ok) {
        pending.resolve(undefined);
        return;
      }
      pending.reject(new PreviewCommandError("failed", result.message ?? this.failMessage));
    },
  },
} as const;

const RESULT_TO_COMMAND = Object.fromEntries(
  Object.entries(RPC_SPECS).map(([commandType, spec]) => [spec.resultType, commandType]),
) as Record<RpcResultType, RpcCommandType>;

let pendingPreviewCommand: PendingPreviewCommand | null = null;

export function cancelPreviewRpc(reason: PreviewCommandError) {
  if (!pendingPreviewCommand) return;
  globalThis.clearTimeout(pendingPreviewCommand.timeoutId);
  pendingPreviewCommand.reject(reason);
  pendingPreviewCommand = null;
}

export function requestPreviewCommand<T extends RpcCommandType>(
  getCommandSender: () => PreviewCommandSender | null,
  command: Extract<PreviewHostCommand, { type: T }>,
): Promise<PreviewRpcSuccess<T>> {
  return new Promise((resolve, reject) => {
    const commandSender = getCommandSender();
    if (!commandSender) {
      reject(new PreviewCommandError("disconnected"));
      return;
    }
    cancelPreviewRpc(new PreviewCommandError("cancelled"));
    const kind = (command as PreviewRpcCommand).type;
    const timeoutId = globalThis.setTimeout(() => {
      if (pendingPreviewCommand?.kind !== kind) return;
      pendingPreviewCommand = null;
      reject(new PreviewCommandError("timeout"));
    }, PREVIEW_COMMAND_TIMEOUT_MS);
    pendingPreviewCommand = {
      kind,
      resolve: resolve as PendingPreviewCommand["resolve"],
      reject,
      timeoutId,
    };
    commandSender(command);
  });
}

export function finishPreviewRpcResult(result: RpcResult) {
  const commandType = RESULT_TO_COMMAND[result.type];
  if (!commandType) return;
  const pending = pendingPreviewCommand;
  if (!pending || pending.kind !== commandType) return;
  pendingPreviewCommand = null;
  globalThis.clearTimeout(pending.timeoutId);
  if (result.type === "checkpoint-capture-result") {
    RPC_SPECS["capture-checkpoint"].settle(pending, result);
    return;
  }
  RPC_SPECS["restore-checkpoint"].settle(pending, result);
}
