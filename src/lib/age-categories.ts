/**
 * @module age-categories
 * @description Phase 1 conformite mineurs : labels manuels des categories d'age
 *              (saisis par le club_admin sur teams.age_category).
 *
 *              ⚠️ Ces labels sont indicatifs. La verite calculee provient
 *              de la fonction SQL `team_has_minors(team_id)` qui interroge
 *              les dates de naissance reelles des membres actifs.
 */

export const TEAM_AGE_CATEGORIES = [
  "U6",
  "U7",
  "U8",
  "U9",
  "U10",
  "U11",
  "U12",
  "U13",
  "U14",
  "U15",
  "U16",
  "U17",
  "U18",
  "U19",
  "Senior",
  "Veteran",
  "Mixte",
] as const;

export type TeamAgeCategory = (typeof TEAM_AGE_CATEGORIES)[number];

/**
 * Heuristique indicative : la categorie de label suggere-t-elle une equipe
 * de mineurs ? (U6..U17 → oui ; U18, U19, Senior, Veteran → non.)
 * Ne remplace PAS team_has_minors() cote DB.
 */
export function ageCategorySuggestsMinors(cat: string | null | undefined): boolean {
  if (!cat) return false;
  const m = /^U(\d{1,2})$/i.exec(cat);
  if (!m) return false;
  return parseInt(m[1], 10) < 18;
}