/**
 * @module theme-palette
 * @description Palette de couleurs par défaut (mode clair) attribuée aux thèmes
 *              de référentiel lorsque aucune couleur explicite n'est définie.
 *              Garantit un fallback déterministe et cohérent dans toute l'app
 *              (radar, badges, headers de thème).
 * @exports THEME_PALETTE — tableau de couleurs HSL ordonnées
 * @maintenance
 *  - Couleurs HSL pour cohérence avec le design system (mem://design)
 *  - Sélecteur utilisateur : mem://style/ui-patterns/color-picker
 *  - Index attribué par modulo (ordre stable des thèmes)
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
