// @engine/sdk/v1/ui/menu - shared menu components (Blackbox engine API v1).
import type { ComponentProps } from "react";
import {
  MenuButton as MenuButtonInternal,
  SettingsPanel as SettingsPanelInternal,
} from "@engine/ui/menu.js";

export type MenuButtonProps = ComponentProps<typeof MenuButtonInternal>;

export function MenuButton(props: MenuButtonProps) {
  return <MenuButtonInternal {...props} />;
}

export function SettingsPanel() {
  return <SettingsPanelInternal />;
}
