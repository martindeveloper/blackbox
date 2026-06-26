// @engine/sdk/v1/characters - character lookup helpers (Blackbox engine API v1).
import type { CharacterView } from "./types.js";
import * as characters from "@engine/lib/characters.js";

export type CharacterLookup = characters.CharacterLookup;

export function indexCharacters(list: CharacterView[]): CharacterLookup {
  return characters.indexCharacters(list);
}

export function characterBySpeaker(
  lookup: CharacterLookup,
  speakerId: string | undefined,
): CharacterView | undefined {
  return characters.characterBySpeaker(lookup, speakerId);
}

export function characterAccentColor(
  character: CharacterView | undefined,
  fallback: string,
): string {
  return characters.characterAccentColor(character, fallback);
}
