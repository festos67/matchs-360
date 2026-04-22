/**
 * @module framework-save
 * @description Sauvegarde optimisée d'un référentiel de compétences.
 *              Remplace les multiples requêtes séquentielles par des opérations
 *              parallélisées et batchées pour réduire la latence (~60 round-trips
 *              séquentiels → ~5-7 requêtes parallèles).
 * @maintenance Voir mem://technical/framework-snapshot-system
 */
import { supabase } from "@/integrations/supabase/client";

export interface SaveSkill {
  id: string;
  name: string;
  definition: string | null;
  order_index: number;
  isNew?: boolean;
}

export interface SaveTheme {
  id: string;
  name: string;
  color: string | null;
  order_index: number;
  skills: SaveSkill[];
  isNew?: boolean;
}

/**
 * Persiste les modifications d'un référentiel en parallélisant et batchant
 * un maximum d'opérations. Renvoie sans attendre fetchData côté appelant.
 */
export async function saveFrameworkChanges(
  frameworkId: string,
  confirmedName: string,
  themesToSave: SaveTheme[],
): Promise<void> {
  // 1) Update name (fire in parallel with theme work below)
  const nameUpdateP = supabase
    .from("competence_frameworks")
    .update({ name: confirmedName })
    .eq("id", frameworkId);

  // 2) Insert all new themes in a single batch and get their ids back
  const newThemes = themesToSave.filter((t) => t.isNew);
  const existingThemes = themesToSave.filter((t) => !t.isNew);

  let createdThemeRows: { id: string }[] = [];
  if (newThemes.length > 0) {
    const payload = newThemes.map((t) => ({
      framework_id: frameworkId,
      name: t.name,
      color: t.color,
      order_index: t.order_index,
    }));
    const { data, error } = await supabase
      .from("themes")
      .insert(payload)
      .select("id");
    if (error) throw error;
    createdThemeRows = data || [];
  }

  // 3) In parallel: update existing themes (one update per theme — no batched
  //    UPDATE possible without RPC), then collect skill operations.
  const themeUpdatePromises = existingThemes.map((t) =>
    supabase
      .from("themes")
      .update({ name: t.name, color: t.color, order_index: t.order_index })
      .eq("id", t.id)
      .then(({ error }) => {
        if (error) throw error;
      }),
  );

  // 4) Collect skill inserts (batch) and skill updates (parallel)
  const skillsToInsert: Array<{
    theme_id: string;
    name: string;
    definition: string | null;
    order_index: number;
  }> = [];
  const skillsToUpdate: SaveSkill[] = [];
  // For each existing theme, ids of skills we kept (used to compute deletions)
  const keptSkillIdsByTheme = new Map<string, string[]>();

  // New themes' skills → all are inserts
  newThemes.forEach((t, i) => {
    const newId = createdThemeRows[i]?.id;
    if (!newId) return;
    for (const s of t.skills) {
      skillsToInsert.push({
        theme_id: newId,
        name: s.name,
        definition: s.definition,
        order_index: s.order_index,
      });
    }
  });

  // Existing themes
  for (const t of existingThemes) {
    const kept: string[] = [];
    for (const s of t.skills) {
      if (s.isNew) {
        skillsToInsert.push({
          theme_id: t.id,
          name: s.name,
          definition: s.definition,
          order_index: s.order_index,
        });
      } else {
        skillsToUpdate.push(s);
        kept.push(s.id);
      }
    }
    keptSkillIdsByTheme.set(t.id, kept);
  }

  const skillUpdatePromises = skillsToUpdate.map((s) =>
    supabase
      .from("skills")
      .update({
        name: s.name,
        definition: s.definition,
        order_index: s.order_index,
      })
      .eq("id", s.id)
      .then(({ error }) => {
        if (error) throw error;
      }),
  );

  const skillInsertP =
    skillsToInsert.length > 0
      ? supabase
          .from("skills")
          .insert(skillsToInsert)
          .then(({ error }) => {
            if (error) throw error;
          })
      : Promise.resolve();

  // Run name update + theme updates + skill updates + skill inserts in parallel
  await Promise.all([
    nameUpdateP.then(({ error }) => {
      if (error) throw error;
    }),
    ...themeUpdatePromises,
    ...skillUpdatePromises,
    skillInsertP,
  ]);

  // 5) Cleanup deletions in parallel.
  //    - Delete skills removed from each existing theme
  //    - Delete themes removed from the framework
  const allPersistedThemeIds = [
    ...existingThemes.map((t) => t.id),
    ...createdThemeRows.map((r) => r.id),
  ];

  const skillDeletePromises = Array.from(keptSkillIdsByTheme.entries()).map(
    ([themeId, keptIds]) => {
      if (keptIds.length > 0) {
        return supabase
          .from("skills")
          .delete()
          .eq("theme_id", themeId)
          .not("id", "in", `(${keptIds.join(",")})`)
          .then(({ error }) => {
            if (error) throw error;
          });
      }
      return supabase
        .from("skills")
        .delete()
        .eq("theme_id", themeId)
        .then(({ error }) => {
          if (error) throw error;
        });
    },
  );

  const themeDeleteP =
    allPersistedThemeIds.length > 0
      ? supabase
          .from("themes")
          .delete()
          .eq("framework_id", frameworkId)
          .not("id", "in", `(${allPersistedThemeIds.join(",")})`)
          .then(({ error }) => {
            if (error) throw error;
          })
      : Promise.resolve();

  await Promise.all([...skillDeletePromises, themeDeleteP]);
}