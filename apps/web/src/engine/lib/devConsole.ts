export type DevConsoleCommand =
  | { type: "help" }
  | { type: "clear" }
  | { type: "goto"; nodeId: string }
  | { type: "ending"; nodeId: string }
  | { type: "chapter_change"; chapterId: string; nodeId?: string }
  | { type: "item_add"; itemRef: string; count: number }
  | { type: "item_remove"; itemRef: string; count: number }
  | { type: "death" };

export interface DevConsoleResult {
  ok: boolean;
  message: string;
}

const HELP = [
  "goto <node id>",
  "ending <node id>  (goto + assert the node resolves to an ending)",
  "chapter_change <chapter id> [node id]",
  "item_add <item id> [count]",
  "item_remove <item id> [count]",
  "death",
  "clear",
  "help",
] as const;

export function devConsoleHelp(): readonly string[] {
  return HELP;
}

function positiveCount(raw: string | undefined): number {
  if (raw === undefined) return 1;
  const count = Number(raw);
  if (!Number.isSafeInteger(count) || count <= 0 || count > 4_294_967_295) {
    throw new Error("count must be a positive integer");
  }
  return count;
}

export function parseDevConsoleCommand(input: string): DevConsoleCommand {
  const [name = "", ...args] = input.trim().split(/\s+/);
  switch (name.toLowerCase()) {
    case "help":
    case "?":
      return { type: "help" };
    case "clear":
    case "cls":
      return { type: "clear" };
    case "goto": {
      const [nodeId, extra] = args;
      if (!nodeId || extra) throw new Error("usage: goto <node id>");
      return { type: "goto", nodeId };
    }
    case "ending": {
      const [nodeId, extra] = args;
      if (!nodeId || extra) throw new Error("usage: ending <node id>");
      return { type: "ending", nodeId };
    }
    case "chapter_change": {
      const [chapterId, nodeId, extra] = args;
      if (!chapterId || extra) {
        throw new Error("usage: chapter_change <chapter id> [node id]");
      }
      return { type: "chapter_change", chapterId, nodeId };
    }
    case "item_add":
    case "item_remove": {
      const [itemRef, rawCount, extra] = args;
      if (!itemRef || extra) throw new Error(`usage: ${name} <item id> [count]`);
      return {
        type: name.toLowerCase() as "item_add" | "item_remove",
        itemRef,
        count: positiveCount(rawCount),
      };
    }
    case "death":
      if (args.length > 0) throw new Error("usage: death");
      return { type: "death" };
    default:
      throw new Error(`unknown command '${name || input.trim()}'`);
  }
}
