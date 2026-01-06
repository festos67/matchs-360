// Evaluation calculation utilities

export interface SkillScore {
  skill_id: string;
  score: number | null;
  is_not_observed: boolean;
  comment: string | null;
}

export interface ThemeScores {
  theme_id: string;
  theme_name: string;
  theme_color: string | null;
  skills: SkillScore[];
  objective: string | null;
}

export const SCORE_LABELS: { [key: number]: string } = {
  1: "Débutant",
  2: "Initié",
  3: "Intermédiaire",
  4: "Avancé",
  5: "Expert",
};

/**
 * Calculate the average score for a theme, excluding:
 * - Skills marked as "not observed"
 * - Skills with null or 0 score
 */
export function calculateThemeAverage(skills: SkillScore[]): number | null {
  const validScores = skills.filter(
    (skill) => !skill.is_not_observed && skill.score !== null && skill.score > 0
  );

  if (validScores.length === 0) {
    return null;
  }

  const sum = validScores.reduce((acc, skill) => acc + (skill.score || 0), 0);
  return sum / validScores.length;
}

/**
 * Calculate radar data from theme scores
 */
export function calculateRadarData(themes: ThemeScores[]): Array<{
  theme: string;
  score: number;
  fullMark: number;
  color: string;
}> {
  return themes.map((theme) => {
    const average = calculateThemeAverage(theme.skills);
    return {
      theme: theme.theme_name,
      score: average !== null ? Math.round(average * 10) / 10 : 0,
      fullMark: 5,
      color: theme.theme_color || "#3B82F6",
    };
  });
}

/**
 * Calculate overall average across all themes
 */
export function calculateOverallAverage(themes: ThemeScores[]): number | null {
  const themeAverages = themes
    .map((theme) => calculateThemeAverage(theme.skills))
    .filter((avg): avg is number => avg !== null);

  if (themeAverages.length === 0) {
    return null;
  }

  return themeAverages.reduce((acc, avg) => acc + avg, 0) / themeAverages.length;
}

/**
 * Get score label
 */
export function getScoreLabel(score: number): string {
  return SCORE_LABELS[Math.round(score)] || "";
}

/**
 * Format average for display
 */
export function formatAverage(average: number | null): string {
  if (average === null) return "-";
  return average.toFixed(1);
}