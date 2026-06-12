import { activeFlagKeys } from "./format.js";

export interface SavePreview {
  nodeId: string | null;
  randomSeed: string | null;
  inventory: Array<[string, number]>;
  flags: string[];
}

function parseRandomSeed(data: Record<string, unknown>): string | null {
  const raw = data.randomSeed ?? data.random_seed;
  if (typeof raw === "number" && Number.isFinite(raw)) return String(Math.trunc(raw));
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return null;
}

export function parseSavePreview(json: string): SavePreview | null {
  try {
    const data = JSON.parse(json) as Record<string, unknown>;
    const nodeId = typeof data.current_node_id === "string" ? data.current_node_id : null;
    const randomSeed = parseRandomSeed(data);

    const inventoryRoot =
      data.inventory && typeof data.inventory === "object"
        ? (data.inventory as Record<string, unknown>).items
        : null;
    const inventory =
      inventoryRoot && typeof inventoryRoot === "object"
        ? Object.entries(inventoryRoot as Record<string, number>).filter(([, count]) => count > 0)
        : [];

    const flags =
      data.flags && typeof data.flags === "object"
        ? activeFlagKeys(data.flags as Record<string, unknown>)
        : [];

    return { nodeId, randomSeed, inventory, flags };
  } catch {
    return null;
  }
}
