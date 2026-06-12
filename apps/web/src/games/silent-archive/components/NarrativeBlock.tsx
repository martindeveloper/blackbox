import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import type { CharacterView, TextBlock } from "../../../engine/types/game.js";
import {
  characterAccentColor,
  characterBySpeaker,
  speakerDisplayName,
  type CharacterLookup,
} from "../lib/characters.js";
import { useCharacterPortrait } from "../../../engine/hooks/useAssetScope.js";

interface NarrativeBlockProps {
  block: TextBlock;
  characters: CharacterLookup;
  isGameOver: boolean;
  prevBlock?: TextBlock;
  onCharacterProfile?: (character: CharacterView) => void;
}

function isSameSpeakerContinuation(block: TextBlock, prev?: TextBlock): boolean {
  if (!prev) return false;
  if (prev.kind !== block.kind) return false;
  if (!block.speaker || !prev.speaker) return false;
  return prev.speaker === block.speaker;
}

function PortraitSlot({
  name,
  accent,
  portrait,
  onOpenProfile,
}: {
  name: string;
  accent: string;
  portrait: ReturnType<typeof useCharacterPortrait>;
  onOpenProfile?: () => void;
}) {
  const { t } = useTranslation();
  if (!portrait.hasPortrait) return null;

  const className = `character-portrait-slot${portrait.ready ? "" : " character-portrait-slot--pending"}${onOpenProfile ? " character-portrait-slot--interactive" : ""}`;

  const content = portrait.url ? (
    <img className="character-portrait-image" src={portrait.url} alt="" loading="lazy" />
  ) : (
    <span className="character-portrait-fallback-name">{name}</span>
  );

  if (!onOpenProfile) {
    return (
      <div className={className} style={{ "--character-accent": accent } as CSSProperties}>
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={className}
      style={{ "--character-accent": accent } as CSSProperties}
      onClick={onOpenProfile}
      aria-label={t("character.openProfile", { name })}
    >
      {content}
    </button>
  );
}

function CharacterBlock({
  block,
  characters,
  isGameOver,
  isContinuation,
  variant,
  onCharacterProfile,
}: NarrativeBlockProps & { isContinuation: boolean; variant: "dialogue" | "thought" }) {
  const isDialogue = variant === "dialogue";
  const side = isDialogue ? (block.side ?? "left") : undefined;
  const character = characterBySpeaker(characters, block.speaker);
  const displayName = speakerDisplayName(character, block.speaker);
  const accent = characterAccentColor(
    character,
    isDialogue ? "var(--color-accent)" : "var(--color-muted-2)",
  );
  const portrait = useCharacterPortrait(character);
  const showHeaderName = Boolean(displayName) && portrait.showHeaderName;
  const showMeta =
    !isContinuation &&
    character &&
    (showHeaderName || portrait.hasPortrait || (isDialogue && Boolean(block.emotion)));
  const gameOverClass = isGameOver
    ? isDialogue
      ? " dialogue-block--game-over"
      : " thought-block--game-over"
    : "";
  const continuationClass = isContinuation
    ? isDialogue
      ? " dialogue-block--continuation"
      : " thought-block--continuation"
    : "";

  return (
    <div
      className={
        isDialogue
          ? `dialogue-block dialogue-block--${side}${gameOverClass}${continuationClass}`
          : `thought-block${gameOverClass}${continuationClass}`
      }
      style={{ "--character-accent": accent } as CSSProperties}
    >
      {showMeta ? (
        <div className={isDialogue ? "dialogue-block-meta" : "thought-block-meta"}>
          {character ? (
            <PortraitSlot
              name={displayName ?? ""}
              accent={accent}
              portrait={portrait}
              onOpenProfile={onCharacterProfile ? () => onCharacterProfile(character) : undefined}
            />
          ) : null}
          {showHeaderName && displayName ? (
            isDialogue ? (
              <div className="dialogue-speaker" style={{ color: accent }}>
                <span className="dialogue-speaker-label">{displayName}</span>
                {block.emotion ? <span className="dialogue-emotion">{block.emotion}</span> : null}
              </div>
            ) : (
              <div className="thought-speaker" style={{ color: accent }}>
                {displayName}
              </div>
            )
          ) : isDialogue && !showHeaderName && block.emotion ? (
            <div className="dialogue-emotion dialogue-emotion--solo">{block.emotion}</div>
          ) : null}
        </div>
      ) : null}
      <p
        className={
          isDialogue
            ? `dialogue-line leading-relaxed${isContinuation ? " dialogue-line--continuation" : ""}`
            : `thought-line leading-relaxed${isContinuation ? " thought-line--continuation" : ""}`
        }
      >
        {isContinuation && block.emotion ? (
          <span className="dialogue-mood-inline" style={{ color: accent }}>
            {block.emotion}
          </span>
        ) : null}
        {block.text}
      </p>
    </div>
  );
}

export function NarrativeBlock({
  block,
  characters,
  isGameOver,
  prevBlock,
  onCharacterProfile,
}: NarrativeBlockProps) {
  const continuation = isSameSpeakerContinuation(block, prevBlock);
  switch (block.kind) {
    case "dialogue":
      return (
        <CharacterBlock
          block={block}
          characters={characters}
          isGameOver={isGameOver}
          isContinuation={continuation}
          variant="dialogue"
          onCharacterProfile={onCharacterProfile}
        />
      );
    case "thought":
      return (
        <CharacterBlock
          block={block}
          characters={characters}
          isGameOver={isGameOver}
          isContinuation={continuation}
          variant="thought"
          onCharacterProfile={onCharacterProfile}
        />
      );
    case "stage_direction":
      return (
        <p className="stage-direction">
          <span className="stage-direction__text">{block.text}</span>
        </p>
      );
    default:
      return (
        <p
          className={`narrative-para leading-relaxed${isGameOver ? " narrative-para--game-over" : ""}`}
        >
          {block.text}
        </p>
      );
  }
}
