/**
 * Default light-mode palette for evaluation themes.
 * Used as a deterministic fallback when a theme has no explicit color.
 */
export const THEME_PALETTE = [
  "#1D4ED8", // Bleu roi
  "#D97706", // Ambre
  "#15803D", // Vert
  "#8B5CF6", // Violet
  "#EC4899", // Rose
  "#0EA5E9", // Bleu ciel
] as const;

export const getThemePaletteColor = (index: number): string => {
  return THEME_PALETTE[index % THEME_PALETTE.length];
};
