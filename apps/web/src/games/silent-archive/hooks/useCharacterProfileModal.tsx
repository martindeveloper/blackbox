import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { CharacterProfileCard } from "../components/CharacterProfileCard.js";
import { KeycardIcon } from "../components/Icons.js";
import { useModal } from "../../../engine/ui/ModalContext.js";
import { characterAccentColor } from "../lib/characters.js";
import type { CharacterView } from "../../../engine/types/game.js";

const MODAL_PREFIX = "character-profile:";

export function useCharacterProfileModal() {
  const { t } = useTranslation();
  const { openModal, closeModal } = useModal();

  const openCharacterProfile = useCallback(
    (character: CharacterView) => {
      const id = `${MODAL_PREFIX}${character.ref_id}`;
      openModal({
        id,
        size: "sm",
        title: character.name,
        eyebrow: t("character.eyebrow"),
        icon: <KeycardIcon size={14} />,
        accentColor: characterAccentColor(character),
        children: <CharacterProfileCard character={character} />,
        onClose: () => closeModal(id),
      });
    },
    [closeModal, openModal, t],
  );

  return { openCharacterProfile };
}
