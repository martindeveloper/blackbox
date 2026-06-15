export const MIN_LEFT_PANEL = 120;
export const MAX_LEFT_PANEL = 480;
export const DEFAULT_LEFT_PANEL = 196;
export const MIN_RIGHT_PANEL = 160;
export const MAX_RIGHT_PANEL = 560;
export const DEFAULT_RIGHT_PANEL = 256;

export function clampLeftPanelWidth(width: number) {
  return Math.max(MIN_LEFT_PANEL, Math.min(MAX_LEFT_PANEL, Math.round(width)));
}

export function clampRightPanelWidth(width: number) {
  return Math.max(MIN_RIGHT_PANEL, Math.min(MAX_RIGHT_PANEL, Math.round(width)));
}
