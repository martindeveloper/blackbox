import type { CharacterView } from "../types/game.js";

export type CharacterLookup = Map<string, CharacterView>;

export function indexCharacters(characters: CharacterView[]): CharacterLookup {
  const lookup = new Map<string, CharacterView>();
  for (const character of characters) {
    lookup.set(character.ref_id, character);
    if (!lookup.has(character.name)) {
      lookup.set(character.name, character);
    }
  }
  return lookup;
}

export function characterBySpeaker(
  lookup: CharacterLookup,
  speakerId: string | undefined,
): CharacterView | undefined {
  if (!speakerId) return undefined;
  return lookup.get(speakerId);
}

export function characterAccentColor(
  character: CharacterView | undefined,
  fallback: string,
): string {
  return character?.color ?? fallback;
}
