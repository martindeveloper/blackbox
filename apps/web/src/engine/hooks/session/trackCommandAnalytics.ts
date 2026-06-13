import { analytics } from "../../lib/vercelAnalytics.js";
import type { submitCommand } from "../../lib/engine.js";
import type { GameView, RollRecord } from "../../types/game.js";

export function trackCommandAnalytics(
  command: Parameters<typeof submitCommand>[1],
  previousView: GameView,
  resultView: GameView,
  rolls: RollRecord[],
  options: {
    chapterChanged: boolean;
    endAnalyticsSession: (reason: string, view: GameView, totalPlaytimeMs?: number) => void;
    currentTotalPlaytimeMs: () => number;
  },
): void {
  if (command.type === "choose") {
    const selectedChoice = previousView.choices.find((choice) => choice.id === command.choice_id);
    analytics.track("Choice Selected", {
      chapter_id: previousView.chapter_id,
      source_node: previousView.node_id,
      choice_id: command.choice_id,
      destination_node: resultView.node_id,
      has_check: Boolean(selectedChoice?.check),
      result_mode: resultView.mode,
    });
  } else if (command.type === "useItem") {
    analytics.track("Item Used", {
      chapter_id: previousView.chapter_id,
      node_id: previousView.node_id,
      item_id: command.item_ref,
      action_id: command.action_id,
    });
  }

  rolls.forEach((roll, index) => {
    if (roll.kind !== "skillCheck") return;
    analytics.track("Skill Check", {
      chapter_id: previousView.chapter_id,
      node_id: previousView.node_id,
      choice_id: command.type === "choose" ? command.choice_id : undefined,
      stat: roll.stat,
      difficulty: roll.difficulty,
      success: roll.success,
      roll_mode: roll.rollMode ?? "normal",
      result_index: index,
    });
  });

  if (options.chapterChanged) {
    analytics.track("Chapter Entered", {
      chapter_id: resultView.chapter_id,
      source_chapter_id: previousView.chapter_id,
      node_id: resultView.node_id,
    });
  }

  if (resultView.mode === "game_over" || resultView.mode === "ending") {
    const totalPlaytimeMs = options.currentTotalPlaytimeMs();
    const terminalProperties = {
      chapter_id: resultView.chapter_id,
      source_node: previousView.node_id,
      terminal_node: resultView.node_id,
      choice_id: command.type === "choose" ? command.choice_id : undefined,
      total_playtime_seconds: Math.floor(totalPlaytimeMs / 1000),
    };
    if (resultView.mode === "game_over") {
      analytics.track("Player Died", terminalProperties);
    } else {
      analytics.track("Ending Reached", terminalProperties);
    }
    options.endAnalyticsSession(resultView.mode, resultView, totalPlaytimeMs);
  }
}
