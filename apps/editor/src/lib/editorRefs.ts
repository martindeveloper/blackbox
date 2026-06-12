import type { Gate, GateNode } from "../types/wire.js";
import type { LoadedBundle } from "./scenarioLoader.js";
import { isTextBlock } from "./libraryRefs.js";

const DEFAULT_STATS = ["hp", "max_hp", "empathy", "logic", "violence"];

function walkGate(gate: Gate | undefined, visit: (node: GateNode) => void): void {
  if (!gate) return;
  if (Array.isArray(gate)) {
    for (const entry of gate) walkGate(entry, visit);
    return;
  }
  visit(gate);
  if (gate.type === "all" || gate.type === "any") {
    for (const cond of gate.conditions ?? []) walkGate(cond, visit);
  } else if (gate.type === "not") {
    walkGate(gate.condition, visit);
  }
}

function collectFromGate(gate: Gate | undefined, out: EditorRefIndex): void {
  walkGate(gate, (node) => {
    switch (node.type) {
      case "hasItem":
        out.items.add(node.itemId);
        break;
      case "hasFlag":
        if (node.flag) out.flags.add(node.flag);
        break;
      case "statGte":
      case "statLte":
      case "statEq":
        if (node.stat) out.stats.add(node.stat);
        break;
      case "visited":
      case "atNode":
        if (node.nodeId) out.nodes.add(node.nodeId);
        break;
      case "actorPresent":
      case "relationshipGte":
      case "relationshipLte":
      case "relationshipEq":
        if (node.characterId) out.characters.add(node.characterId);
        if ("metric" in node && node.metric) {
          out.metrics.add(`${node.characterId}:${node.metric}`);
        }
        break;
      default:
        break;
    }
  });
}

export interface EditorRefIndex {
  nodes: Set<string>;
  items: Set<string>;
  characters: Set<string>;
  flags: Set<string>;
  events: Set<string>;
  stats: Set<string>;
  chapters: Set<string>;
  metrics: Set<string>;
}

export function emptyRefIndex(): EditorRefIndex {
  return {
    nodes: new Set(),
    items: new Set(),
    characters: new Set(),
    flags: new Set(),
    events: new Set(),
    stats: new Set(),
    chapters: new Set(),
    metrics: new Set(),
  };
}

export function buildEditorRefIndex(bundle: LoadedBundle): EditorRefIndex {
  const out = emptyRefIndex();

  for (const stat of Object.keys(bundle.scenario.defaultStats ?? {})) {
    out.stats.add(stat);
  }
  for (const stat of DEFAULT_STATS) out.stats.add(stat);

  for (const char of Object.values(bundle.characters.characters)) {
    out.characters.add(char.id);
    for (const metric of Object.keys(char.relationships ?? {})) {
      out.metrics.add(`${char.id}:${metric}`);
    }
  }

  for (const itemId of Object.keys(bundle.items.items)) out.items.add(itemId);

  for (const flagId of Object.keys(bundle.meta?.flags ?? {})) out.flags.add(flagId);
  for (const eventId of Object.keys(bundle.meta?.events ?? {})) out.events.add(eventId);

  for (const chapter of bundle.scenario.chapters) out.chapters.add(chapter.id);

  for (const chapter of Object.values(bundle.chapters)) {
    for (const nodeId of Object.keys(chapter.nodes)) out.nodes.add(nodeId);
    if (chapter.startNodeId) out.nodes.add(chapter.startNodeId);
    if (chapter.deathNodeId) out.nodes.add(chapter.deathNodeId);
  }

  if (bundle.scenario.nodes) {
    for (const nodeId of Object.keys(bundle.scenario.nodes)) out.nodes.add(nodeId);
  }

  for (const chapter of Object.values(bundle.chapters)) {
    for (const node of Object.values(chapter.nodes)) {
      for (const block of node.text ?? []) {
        if (!isTextBlock(block)) continue;
        collectFromGate(block.when, out);
        collectFromGate(block.unless, out);
      }
      for (const choice of node.choices ?? []) {
        collectFromGate(choice.requires, out);
        collectFromGate(choice.when, out);
        collectFromGate(choice.unless, out);
        if (choice.goto) out.nodes.add(choice.goto);
        if (choice.check?.stat) out.stats.add(choice.check.stat);
      }
    }
  }

  for (const item of Object.values(bundle.items.items)) {
    for (const action of item.actions ?? []) {
      collectFromGate(action.requires, out);
      collectFromGate(action.when, out);
      collectFromGate(action.unless, out);
      if (action.goto) out.nodes.add(action.goto);
    }
  }

  if (bundle.library?.conditions) {
    for (const gate of Object.values(bundle.library.conditions)) collectFromGate(gate, out);
  }

  return out;
}

export function sortedRefList(set: Set<string>): string[] {
  return [...set].filter(Boolean).sort((a, b) => a.localeCompare(b));
}

export function metricsForCharacter(bundle: LoadedBundle, characterId: string): string[] {
  const declared = bundle.characters.characters[characterId]?.relationships ?? {};
  return Object.keys(declared).sort();
}
