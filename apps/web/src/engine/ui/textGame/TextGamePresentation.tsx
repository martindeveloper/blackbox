import { useMemo } from "react";
import { defaultTextGameComponents } from "./defaults.js";
import { TextGamePresentationContext } from "./context.js";
import type { TextGameComponentOverrides } from "./types.js";

export function TextGamePresentationProvider({
  components,
  children,
}: {
  components?: TextGameComponentOverrides;
  children: React.ReactNode;
}) {
  const value = useMemo(() => ({ ...defaultTextGameComponents, ...components }), [components]);
  return (
    <TextGamePresentationContext.Provider value={value}>
      {children}
    </TextGamePresentationContext.Provider>
  );
}

export { useTextGameComponents } from "./context.js";

export type {
  ChoicesProps,
  GameScreenProps,
  IntelProps,
  InventoryProps,
  JournalProps,
  MainMenuProps,
  NarrativeProps,
  ResolutionProps,
  SystemMenuProps,
  TextGameComponentOverrides,
  TextGameComponents,
  VitalsProps,
} from "./types.js";
