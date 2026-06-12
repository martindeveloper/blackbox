import type { CharacterView } from "../../../engine/types/game.js";
import i18n from "../../../i18n/index.js";
import { formatRefId } from "../../../engine/lib/format.js";
import { characterAccentColor as engineCharacterAccentColor } from "../../../engine/lib/characters.js";
export {
  characterBySpeaker,
  indexCharacters,
  type CharacterLookup,
} from "../../../engine/lib/characters.js";

export function speakerDisplayName(
  character: CharacterView | undefined,
  speakerId: string | undefined,
): string | undefined {
  if (character) return character.name;
  if (!speakerId) return undefined;
  if (speakerId === "YOU") return i18n.t("character.you");
  return formatRefId(speakerId);
}

export function characterAccentColor(
  character: CharacterView | undefined,
  fallback = "var(--color-accent)",
): string {
  return engineCharacterAccentColor(character, fallback);
}
