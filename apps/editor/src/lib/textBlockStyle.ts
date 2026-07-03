export const QUICK_TEXT_STYLES = ["quoted", "terminal", "emphasis"] as const;

export type QuickTextStyle = (typeof QUICK_TEXT_STYLES)[number];

export function parseTextBlockStyleInput(value: string): string[] {
  return value
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
}

export function formatTextBlockStyleInput(style: string[] | undefined): string {
  return style?.join(", ") ?? "";
}

export function styleHasToken(style: string[] | undefined, token: QuickTextStyle): boolean {
  return (style ?? []).some((entry) => entry.trim().toLowerCase() === token);
}

export function toggleTextBlockStyle(
  style: string[] | undefined,
  token: QuickTextStyle,
): string[] | undefined {
  if (styleHasToken(style, token)) {
    const next = (style ?? []).filter((entry) => entry.trim().toLowerCase() !== token);
    return next.length > 0 ? next : undefined;
  }
  return [...(style ?? []), token];
}
