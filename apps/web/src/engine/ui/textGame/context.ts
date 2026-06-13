import { createContext, useContext } from "react";
import type { TextGameComponents } from "./types.js";

export const TextGamePresentationContext = createContext<TextGameComponents | null>(null);

export function useTextGameComponents(): TextGameComponents {
  const components = useContext(TextGamePresentationContext);
  if (!components) {
    throw new Error("Text-game components are unavailable outside TextGamePresentationProvider");
  }
  return components;
}
