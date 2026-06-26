// @engine/sdk/v1/types - owned public type surface (Blackbox engine API v1).
//
// FOUNDATION: v1 owns every public type *name*. Today each is an alias of the
// internal wire type, so they are structurally identical and zero-cost. The value
// is the declaration site: when an internal type changes shape, freeze the old
// shape here (replace the alias with an explicit definition) and translate at the
// value wrappers - the public name never moves. See ./README.md.
import type * as Wire from "@engine/types/game.js";

export type NodeMode = Wire.NodeMode;
export type DialogueSide = Wire.DialogueSide;
export type TextBlock = Wire.TextBlock;
export type MusicCue = Wire.MusicCue;
export type SfxCue = Wire.SfxCue;
export type TextureCue = Wire.TextureCue;
export type RelationshipMetricView = Wire.RelationshipMetricView;
export type CharacterView = Wire.CharacterView;
export type RelationshipCharacterView = Wire.RelationshipCharacterView;
export type InventoryItemView = Wire.InventoryItemView;
export type ItemActionView = Wire.ItemActionView;
export type ItemExamineView = Wire.ItemExamineView;
export type ChoiceAction = Wire.ChoiceAction;
export type RollMode = Wire.RollMode;
export type CheckPreview = Wire.CheckPreview;
export type RollRecord = Wire.RollRecord;
export type UiNotification = Wire.UiNotification;
export type ChoiceView = Wire.ChoiceView;
export type CatalogEntry = Wire.CatalogEntry;
export type MetaCatalog = Wire.MetaCatalog;
export type GameView = Wire.GameView;
export type EngineError = Wire.EngineError;
export type CommandResult = Wire.CommandResult;
export type ScenarioBundle = Wire.ScenarioBundle;
