export type InterpolationContext = "text" | "gate" | "effect";

export interface InterpolationToken {
  id: string;
  insert: string;
  labelKey: string;
  contexts: InterpolationContext[];
}

export const INTERPOLATION_TOKENS: InterpolationToken[] = [
  {
    id: "stat",
    insert: "{stat.hp}",
    labelKey: "interpolation.tokens.stat",
    contexts: ["text", "gate"],
  },
  {
    id: "item",
    insert: "{item.key}",
    labelKey: "interpolation.tokens.item",
    contexts: ["text", "gate"],
  },
  {
    id: "flag",
    insert: "{flag.done}",
    labelKey: "interpolation.tokens.flag",
    contexts: ["text", "gate"],
  },
  {
    id: "relationship",
    insert: "{relationship.ally.affinity}",
    labelKey: "interpolation.tokens.relationship",
    contexts: ["text", "gate"],
  },
  {
    id: "param",
    insert: "{param.KEY}",
    labelKey: "interpolation.tokens.param",
    contexts: ["text"],
  },
  {
    id: "random",
    insert: "random(1, 6)",
    labelKey: "interpolation.tokens.random",
    contexts: ["effect"],
  },
  {
    id: "dice",
    insert: "dice(20)",
    labelKey: "interpolation.tokens.dice",
    contexts: ["effect"],
  },
];

export function tokensForContext(context: InterpolationContext): InterpolationToken[] {
  return INTERPOLATION_TOKENS.filter((token) => token.contexts.includes(context));
}
