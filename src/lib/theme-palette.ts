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
/**
 * Palette de 15 couleurs harmonisées pour les thématiques de référentiel.
 * Ordonnées par teinte (bleus → verts → jaunes → rouges → violets → neutres)
 * pour faciliter le repérage visuel dans le sélecteur.
 */
export const THEME_PALETTE = [
  // Bleus
  "#1D4ED8", // Bleu roi
  "#0EA5E9", // Bleu ciel
  "#0891B2", // Cyan
  // Verts
  "#15803D", // Vert forêt
  "#10B981", // Émeraude
  "#84CC16", // Lime
  // Chauds
  "#D97706", // Ambre
  "#F59E0B", // Or
  "#F97316", // Orange
  // Rouges / roses
  "#EF4444", // Rouge
  "#EC4899", // Rose
  "#BE185D", // Magenta
  // Violets / neutres
  "#8B5CF6", // Violet
  "#6366F1", // Indigo
  "#475569", // Ardoise
] as const;

export const THEME_PALETTE_LABELS: Record<string, string> = {
  "#1D4ED8": "Bleu roi",
  "#0EA5E9": "Bleu ciel",
  "#0891B2": "Cyan",
  "#15803D": "Vert forêt",
  "#10B981": "Émeraude",
  "#84CC16": "Lime",
  "#D97706": "Ambre",
  "#F59E0B": "Or",
  "#F97316": "Orange",
  "#EF4444": "Rouge",
  "#EC4899": "Rose",
  "#BE185D": "Magenta",
  "#8B5CF6": "Violet",
  "#6366F1": "Indigo",
  "#475569": "Ardoise",
};

export const getThemePaletteColor = (index: number): string => {
  return THEME_PALETTE[index % THEME_PALETTE.length];
};
