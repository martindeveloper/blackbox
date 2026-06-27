import { bootGame as bootGameInternal } from "@engine/boot.js";
import type {
  GameDefinition as GameDefinitionInternal,
  WebPlayerOptions as WebPlayerOptionsInternal,
} from "@engine/boot.js";

export type GameDefinition = GameDefinitionInternal;
export type WebPlayerOptions = WebPlayerOptionsInternal;

export function bootGame(game: GameDefinition): void {
  bootGameInternal(game);
}
