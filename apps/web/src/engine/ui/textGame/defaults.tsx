import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { characterBySpeaker } from "../../lib/characters.js";
import { activeIntelKeys, formatRefId } from "../../lib/format.js";
import { isEditableTarget } from "../../lib/keyboard.js";
import {
  clearSlot,
  getSlotCount,
  persistLastUsedSlot,
  readAllSlots,
  readLastUsedSlot,
  type SlotData,
} from "../../lib/slots.js";
import type { ChoiceView, ItemActionView } from "../../types/game.js";
import { useModal } from "../ModalContext.js";
import { useTextGameComponents } from "./context.js";
import type {
  ChoicesProps,
  GameScreenProps,
  IntelProps,
  InventoryProps,
  JournalProps,
  MainMenuProps,
  NarrativeProps,
  ResolutionProps,
  SystemMenuProps,
  TextGameComponents,
  VitalsProps,
} from "./types.js";
import { indexCharacters } from "../../lib/characters.js";

function LockReason({ reason }: { reason: string }) {
  const { t } = useTranslation();
  return (
    <span className="bb-default-choice__lock">{t("choices.locked", { defaultValue: reason })}</span>
  );
}

function dispatchChoice(
  choice: ChoiceView,
  handlers: Pick<ChoicesProps, "onChoose" | "onRestart" | "onOpenLoad" | "onOpenMainMenu">,
): void {
  if (choice.action?.type === "openLoadMenu") handlers.onOpenLoad();
  else if (choice.action?.type === "openMainMenu") handlers.onOpenMainMenu();
  else if (choice.action?.type === "restartGame") handlers.onRestart();
  else handlers.onChoose(choice.id);
}

export function DefaultChoices({
  view,
  isGameOver,
  isEnding,
  isTerminal,
  isRolling,
  visible,
  choiceClass,
  borderColor,
  onChoose,
  onContinue,
  onReturnToChapterStart,
  onRestart,
  onOpenLoad,
  onOpenMainMenu,
}: ChoicesProps) {
  const { t } = useTranslation();
  const choices = view.choices;

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (!visible || isRolling || isEditableTarget(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      const index = Number(event.key) - 1;
      if (!Number.isInteger(index) || index < 0 || index > 8) return;

      if (isGameOver) {
        const actions = [onReturnToChapterStart, onRestart, onOpenMainMenu];
        const action = actions[index];
        if (!action) return;
        event.preventDefault();
        action();
        return;
      }
      if (isEnding) {
        if (index !== 0) return;
        event.preventDefault();
        onOpenMainMenu();
        return;
      }
      const choice = choices[index];
      if (choice?.enabled) {
        event.preventDefault();
        dispatchChoice(choice, { onChoose, onRestart, onOpenLoad, onOpenMainMenu });
      } else if (!isTerminal && choices.length === 0 && index === 0) {
        event.preventDefault();
        onContinue();
      }
    }

    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [
    choices,
    isEnding,
    isGameOver,
    isRolling,
    isTerminal,
    onChoose,
    onContinue,
    onOpenLoad,
    onOpenMainMenu,
    onRestart,
    onReturnToChapterStart,
    visible,
  ]);

  if (!visible) return <div className="bb-default-choices" style={{ borderColor }} />;

  const actions = isGameOver
    ? [
        { label: t("choices.returnToChapterStart"), action: onReturnToChapterStart },
        { label: t("choices.restart"), action: onRestart },
        { label: t("choices.goToMainMenu"), action: onOpenMainMenu },
      ]
    : isEnding
      ? [{ label: t("choices.goToMainMenu"), action: onOpenMainMenu }]
      : choices.length === 0
        ? [{ label: t("choices.continue"), action: onContinue }]
        : null;

  return (
    <div className="bb-default-choices" style={{ borderColor }}>
      <div className="bb-default-choices__shell">
        <div className="bb-default-section-rule">{t("choices.selectResponse")}</div>
        {isRolling ? (
          <div className="bb-default-choices__resolving">{t("choices.resolving")}</div>
        ) : (
          <div className="bb-default-choices__list">
            {actions
              ? actions.map((action, index) => (
                  <button
                    key={action.label}
                    type="button"
                    className={`bb-default-choice ${choiceClass}`}
                    onClick={action.action}
                  >
                    <span className="bb-default-choice__number">{index + 1}</span>
                    <span>{action.label}</span>
                  </button>
                ))
              : choices.map((choice, index) => (
                  <button
                    key={choice.id}
                    type="button"
                    className={`bb-default-choice ${choiceClass}${choice.enabled ? "" : " bb-default-choice--disabled"}`}
                    disabled={!choice.enabled}
                    onClick={() =>
                      dispatchChoice(choice, { onChoose, onRestart, onOpenLoad, onOpenMainMenu })
                    }
                  >
                    <span className="bb-default-choice__number">{index + 1}</span>
                    <span>
                      {choice.label}
                      {choice.check && (
                        <span className="bb-default-choice__check">
                          {choice.check.label ?? choice.check.stat.toUpperCase()} ·{" "}
                          {t("choices.dc")} {choice.check.difficulty}
                        </span>
                      )}
                      {!choice.enabled && choice.disabledReason && (
                        <LockReason reason={choice.disabledReason} />
                      )}
                    </span>
                  </button>
                ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function DefaultNarrative({ block, characters, isGameOver, prevBlock }: NarrativeProps) {
  const character = characterBySpeaker(characters, block.speaker);
  const speaker = character?.name ?? block.speaker;
  const continuation =
    Boolean(block.speaker) && prevBlock?.kind === block.kind && prevBlock.speaker === block.speaker;

  if (block.kind === "stage_direction") {
    return <p className="bb-default-narrative__stage-direction">{block.text}</p>;
  }
  if (block.kind === "dialogue" || block.kind === "thought") {
    return (
      <div
        className={`bb-default-narrative__${block.kind}${continuation ? ` bb-default-narrative__${block.kind}--continuation` : ""}`}
      >
        {!continuation && speaker && <div className="bb-default-narrative__speaker">{speaker}</div>}
        <p className="bb-default-narrative__line">
          {block.emotion && <span className="bb-default-narrative__emotion">{block.emotion}</span>}
          {block.text}
        </p>
      </div>
    );
  }
  return (
    <p
      className={`bb-default-narrative__paragraph${isGameOver ? " bb-default-narrative__paragraph--game-over" : ""}`}
    >
      {block.text}
    </p>
  );
}

export function DefaultResolution({ rolls, notifications }: ResolutionProps) {
  const { t } = useTranslation();
  if (!rolls.length && !notifications.length) return null;
  return (
    <div className="bb-default-resolution">
      <div className="bb-default-section-rule">{t("resolution.title")}</div>
      {rolls.map((roll, index) => (
        <div
          key={`${roll.kind}-${index}`}
          className={`bb-default-roll${roll.kind === "skillCheck" ? (roll.success ? " bb-default-roll--pass" : " bb-default-roll--fail") : ""}`}
        >
          <strong>{roll.label ?? (roll.kind === "skillCheck" ? roll.stat : roll.kind)}</strong>
          <span>
            {roll.roll}
            {roll.modifier ? ` + ${roll.modifier}` : ""} = {roll.total}
          </span>
          {roll.kind === "skillCheck" && (
            <span>{roll.success ? t("resolution.pass") : t("resolution.fail")}</span>
          )}
        </div>
      ))}
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className={`bb-default-notification bb-default-notification--${notification.category}`}
        >
          {notification.category === "stat"
            ? `${formatRefId(notification.stat)} ${notification.change} ${notification.amount}`
            : notification.category === "item"
              ? notification.itemName
              : notification.category === "intel"
                ? notification.intelName
                : `${notification.category} ${notification.amount}`}
        </div>
      ))}
    </div>
  );
}

function statLabel(key: string): string {
  return key.replace(/_/g, " ").toUpperCase();
}

export function DefaultVitals({ playerStats, borderColor, controls }: VitalsProps) {
  const stats = Object.entries(playerStats ?? {});
  if (!stats.length && !controls) return null;
  return (
    <div className="bb-default-vitals" style={{ borderColor }}>
      <div className="bb-default-vitals__stats">
        {stats.map(([key, value]) => (
          <div key={key} className="bb-default-stat">
            <div className="bb-default-stat__value">{value}</div>
            <div className="bb-default-stat__key">{statLabel(key)}</div>
          </div>
        ))}
      </div>
      {controls && <div className="bb-default-vitals__controls">{controls}</div>}
    </div>
  );
}

function actionsByItem(actions: ItemActionView[]): Map<string, ItemActionView[]> {
  const result = new Map<string, ItemActionView[]>();
  actions.forEach((action) => {
    const entries = result.get(action.item_ref) ?? [];
    entries.push(action);
    result.set(action.item_ref, entries);
  });
  return result;
}

export function DefaultInventory({
  view,
  examine,
  commandPending,
  onExamine,
  onUse,
}: InventoryProps) {
  const { t } = useTranslation();
  const [selectedRef, setSelectedRef] = useState<string | null>(
    view.inventory_items[0]?.ref_id ?? null,
  );
  const actions = useMemo(() => actionsByItem(view.item_actions), [view.item_actions]);
  const selected = view.inventory_items.find((item) => item.ref_id === selectedRef);

  useEffect(() => {
    if (!view.inventory_items.length) {
      setSelectedRef(null);
      return;
    }
    if (selectedRef && view.inventory_items.some((item) => item.ref_id === selectedRef)) return;
    const firstRef = view.inventory_items[0]!.ref_id;
    setSelectedRef(firstRef);
    onExamine(firstRef);
  }, [onExamine, selectedRef, view.inventory_items]);

  if (!view.inventory_items.length)
    return <p className="bb-default-empty-state">{t("inventory.empty")}</p>;
  return (
    <div className="bb-default-inventory">
      <div className="bb-default-inventory__grid">
        {view.inventory_items.map((item) => (
          <button
            key={item.ref_id}
            type="button"
            className={`bb-default-inventory__slot${selectedRef === item.ref_id ? " bb-default-inventory__slot--selected" : ""}`}
            onClick={() => {
              setSelectedRef(item.ref_id);
              onExamine(item.ref_id);
            }}
          >
            <strong>{item.name}</strong>
            {item.count > 1 && <span>×{item.count}</span>}
          </button>
        ))}
      </div>
      <aside className="bb-default-inventory__detail">
        {selected && <h3>{selected.name}</h3>}
        {commandPending && examine?.ref_id !== selectedRef ? (
          <p>{t("inventory.loading")}</p>
        ) : examine?.ref_id === selectedRef ? (
          <>
            <p>{examine.description}</p>
            <p>{examine.examine_text}</p>
          </>
        ) : (
          <p>{t("inventory.selectPrompt")}</p>
        )}
        {(selectedRef ? (actions.get(selectedRef) ?? []) : []).map((action) => (
          <button
            key={action.action_id}
            type="button"
            disabled={!action.enabled}
            onClick={() => selectedRef && onUse(selectedRef, action.action_id)}
          >
            {action.label}
          </button>
        ))}
      </aside>
    </div>
  );
}

export function DefaultIntel({ memories, meta }: IntelProps) {
  const { t } = useTranslation();
  if (!memories.length) return <p className="bb-default-empty-state">{t("memory.empty")}</p>;
  return (
    <div className="bb-default-intel">
      {memories.map((id) => (
        <article key={id} className="bb-default-intel__card">
          <h3>{meta.flags[id]?.title ?? formatRefId(id)}</h3>
          {meta.flags[id]?.description && <p>{meta.flags[id].description}</p>}
        </article>
      ))}
    </div>
  );
}

export function DefaultJournal({ events, meta }: JournalProps) {
  const { t } = useTranslation();
  if (!events.length) return <p className="bb-default-empty-state">{t("journal.empty")}</p>;
  return (
    <ol className="bb-default-journal">
      {[...events].reverse().map((id, index) => (
        <li key={`${index}-${id}`} className="bb-default-journal__entry">
          <strong>{meta.events[id]?.title ?? formatRefId(id)}</strong>
          {meta.events[id]?.description && <p>{meta.events[id].description}</p>}
        </li>
      ))}
    </ol>
  );
}

export function DefaultSystemMenu({
  isTerminal,
  onSave,
  onOpenMainMenu,
  onRestart,
  onCreateSupportBundle,
}: SystemMenuProps) {
  const { t } = useTranslation();
  return (
    <div className="bb-default-system-menu">
      <button type="button" onClick={onSave}>
        {t("save.title")}
      </button>
      <button type="button" onClick={onOpenMainMenu}>
        {t("choices.goToMainMenu")}
      </button>
      {!isTerminal && (
        <button type="button" onClick={onRestart}>
          {t("choices.restart")}
        </button>
      )}
      <button type="button" onClick={onCreateSupportBundle}>
        {t("mainMenu.supportBundle", { defaultValue: "SUPPORT BUNDLE" })}
      </button>
    </div>
  );
}

export function DefaultMainMenu({
  menuLoading,
  initialSlot,
  onContinueSlot,
  onRestartSlot,
  onCreateSupportBundle,
}: MainMenuProps) {
  const { t } = useTranslation();
  const [slots, setSlots] = useState<(SlotData | null)[]>(readAllSlots);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(initialSlot ?? readLastUsedSlot);
  const slotCount = getSlotCount();

  return (
    <div className="bb-default-main-menu">
      <header>
        <h1>{t("mainMenu.title", { defaultValue: "SELECT A SAVE" })}</h1>
      </header>
      <div className="bb-default-main-menu__slots">
        {Array.from({ length: slotCount }, (_, index) => {
          const slot = slots[index];
          return (
            <article
              key={index}
              className={`bb-default-main-menu__slot${selectedSlot === index ? " bb-default-main-menu__slot--selected" : ""}`}
            >
              <button type="button" onClick={() => setSelectedSlot(index)}>
                <strong>
                  {t("mainMenu.slot", { defaultValue: "SLOT {{number}}", number: index + 1 })}
                </strong>
                <span>
                  {slot
                    ? (slot.location ?? slot.nodeId ?? slot.savedAt)
                    : t("mainMenu.emptySlot", { defaultValue: "EMPTY" })}
                </span>
              </button>
              {slot && (
                <button
                  type="button"
                  onClick={() => {
                    clearSlot(index);
                    setSlots(readAllSlots());
                  }}
                >
                  {t("mainMenu.deleteSlot", { defaultValue: "DELETE" })}
                </button>
              )}
            </article>
          );
        })}
      </div>
      {selectedSlot !== null && (
        <div className="bb-default-main-menu__actions">
          {slots[selectedSlot] && (
            <button
              type="button"
              disabled={menuLoading}
              onClick={() => {
                persistLastUsedSlot(selectedSlot);
                onContinueSlot(selectedSlot);
              }}
            >
              {t("mainMenu.continue", { defaultValue: "CONTINUE" })}
            </button>
          )}
          <button
            type="button"
            disabled={menuLoading}
            onClick={() => {
              persistLastUsedSlot(selectedSlot);
              onRestartSlot(selectedSlot);
            }}
          >
            {t("mainMenu.newGame", { defaultValue: "NEW GAME" })}
          </button>
        </div>
      )}
      <button type="button" onClick={onCreateSupportBundle}>
        {t("mainMenu.supportBundle", { defaultValue: "SUPPORT BUNDLE" })}
      </button>
    </div>
  );
}

export function DefaultGameScreen({
  view,
  lastRolls,
  notifications,
  commandPending,
  examine,
  onChoose,
  onContinue,
  onExamine,
  onUseItem,
  onSave,
  onReturnToChapterStart,
  onRestart,
  onOpenLoad,
  onOpenMainMenu,
  onCreateSupportBundle,
}: GameScreenProps) {
  const { t } = useTranslation();
  const { openModal, closeModal } = useModal();
  const components = useTextGameComponents();
  const characters = useMemo(() => indexCharacters(view.characters), [view.characters]);
  const intel = activeIntelKeys(view.flags, view.meta);
  const isGameOver = view.mode === "game_over";
  const isEnding = view.mode === "ending";
  const isTerminal = isGameOver || isEnding;

  const openPanel = (id: "inventory" | "intel" | "journal" | "system") => {
    const modalId = `text-game:${id}`;
    const close = () => closeModal(modalId);
    const common = { id: modalId, onClose: close, size: "lg" as const };
    if (id === "inventory") {
      const Inventory = components.Inventory;
      openModal({
        ...common,
        title: t("inventory.title"),
        children: (
          <Inventory
            view={view}
            examine={examine}
            commandPending={commandPending}
            onExamine={onExamine}
            onUse={onUseItem}
          />
        ),
      });
    } else if (id === "intel") {
      const Intel = components.Intel;
      openModal({
        ...common,
        title: t("memory.title"),
        children: <Intel memories={intel} meta={view.meta} />,
      });
    } else if (id === "journal") {
      const Journal = components.Journal;
      openModal({
        ...common,
        title: t("journal.title"),
        children: <Journal events={view.events} meta={view.meta} />,
      });
    } else {
      const SystemMenu = components.SystemMenu;
      openModal({
        ...common,
        size: "md",
        title: t("menu.title", { defaultValue: "SYSTEM" }),
        children: (
          <SystemMenu
            isTerminal={isTerminal}
            onSave={onSave}
            onOpenMainMenu={onOpenMainMenu}
            onRestart={onRestart}
            onCreateSupportBundle={onCreateSupportBundle}
          />
        ),
      });
    }
  };

  const Vitals = components.Vitals;
  const Narrative = components.Narrative;
  const Resolution = components.Resolution;
  const Choices = components.Choices;

  return (
    <div className="bb-default-game-screen">
      <header className="bb-default-game-screen__location">
        <h2>{view.title ?? view.node_id}</h2>
        <span>{view.chapter_title}</span>
      </header>
      <Vitals
        playerStats={view.player_stats}
        borderColor="var(--bb-ui-border)"
        controls={
          <div className="bb-default-game-screen__panel-actions">
            <button type="button" onClick={() => openPanel("inventory")}>
              {t("inventory.title")} ({view.inventory_items.length})
            </button>
            <button type="button" onClick={() => openPanel("intel")}>
              {t("memory.title")} ({intel.length})
            </button>
            <button type="button" onClick={() => openPanel("journal")}>
              {t("journal.title")} ({view.events.length})
            </button>
            <button type="button" onClick={() => openPanel("system")}>
              {t("menu.title", { defaultValue: "SYSTEM" })}
            </button>
          </div>
        }
      />
      <main className="bb-default-game-screen__narrative">
        <div className="bb-default-game-screen__narrative-stack">
          {view.text.map((block, index) => (
            <Narrative
              key={`${view.node_id}-${index}`}
              block={block}
              prevBlock={view.text[index - 1]}
              characters={characters}
              isGameOver={isGameOver}
            />
          ))}
        </div>
        <Resolution rolls={lastRolls} notifications={notifications} />
      </main>
      <Choices
        view={view}
        isGameOver={isGameOver}
        isEnding={isEnding}
        isTerminal={isTerminal}
        isRolling={commandPending}
        visible
        choiceClass="bb-default-choice-item"
        borderColor="var(--bb-ui-border)"
        onChoose={onChoose}
        onContinue={onContinue}
        onReturnToChapterStart={onReturnToChapterStart}
        onRestart={onRestart}
        onOpenLoad={onOpenLoad}
        onOpenMainMenu={onOpenMainMenu}
      />
    </div>
  );
}

export const defaultTextGameComponents: TextGameComponents = {
  MainMenu: DefaultMainMenu,
  GameScreen: DefaultGameScreen,
  SystemMenu: DefaultSystemMenu,
  Choices: DefaultChoices,
  Narrative: DefaultNarrative,
  Resolution: DefaultResolution,
  Vitals: DefaultVitals,
  Inventory: DefaultInventory,
  Intel: DefaultIntel,
  Journal: DefaultJournal,
};
