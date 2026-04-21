/**
 * @module framework-snapshot
 * @description Bibliothèque de gestion des instantanés (snapshots) de référentiels.
 *              Crée une copie JSONB du référentiel actuel avant chaque modification
 *              pour préserver l'historique des versions et permettre la restauration
 *              des débriefs avec leur référentiel d'origine.
 * @exports
 *  - snapshotFramework(frameworkId) : crée un snapshot dans framework_snapshots
 * @features
 *  - Optimisé : 3 requêtes (1 framework + 1 batch themes + 1 batch skills)
 *  - Sérialisation JSONB complète (id, name, themes[], skills[])
 *  - Appelé automatiquement à chaque save d'éditeur ou création de débrief
 * @maintenance
 *  - Système snapshot : mem://technical/framework-snapshot-system
 *  - Cycle de vie : mem://features/framework-lifecycle-management
 *  - Politique de purge : mem://technical/data-retention-policy
 */
import { supabase } from "@/integrations/supabase/client";
import type { FrameworkTheme, FrameworkSkill } from "@/lib/framework-loader";
export async function snapshotFramework(frameworkId: string): Promise<void> {
  // 1. Fetch current framework
  const { data: fw, error: fwError } = await supabase
    .from("competence_frameworks")
    .select("*")
    .eq("id", frameworkId)
    .maybeSingle();

  if (fwError || !fw) {
    console.warn("snapshotFramework: could not fetch framework", fwError);
    return;
  }

  // 2. Fetch themes with skills
  const { data: themes } = await supabase
    .from("themes")
    .select("*, skills(*)")
    .eq("framework_id", frameworkId)
    .order("order_index");

  if (!themes || themes.length === 0) return;

  // 3. Create archived copy of the framework (1 query)
  const { data: archivedFw, error: copyError } = await supabase
    .from("competence_frameworks")
    .insert({
      name: fw.name,
      club_id: (fw as any).club_id,
      team_id: (fw as any).team_id,
      is_template: fw.is_template,
      is_archived: true,
      archived_at: new Date().toISOString(),
    } as any)
    .select()
    .single();

  if (copyError || !archivedFw) {
    console.warn("snapshotFramework: could not create archived copy", copyError);
    return;
  }

  // 4. Batch insert ALL themes at once (1 query)
  const themesPayload = themes.map((t) => ({
    framework_id: archivedFw.id,
    name: t.name,
    color: t.color,
    order_index: t.order_index,
  }));

  const { data: newThemes, error: themesError } = await supabase
    .from("themes")
    .insert(themesPayload)
    .select();

  if (themesError || !newThemes) {
    console.warn("snapshotFramework: could not batch insert themes", themesError);
    return;
  }

  // 5. Map old theme order to new theme IDs, then batch insert ALL skills (1 query)
  const allSkills: Array<{ theme_id: string; name: string; definition: string | null; order_index: number }> = [];

  for (let i = 0; i < themes.length; i++) {
    const originalTheme = themes[i];
    const newTheme = newThemes[i];
    const skills = (originalTheme.skills || []) as unknown as FrameworkSkill[];

    for (const s of skills) {
      allSkills.push({
        theme_id: newTheme.id,
        name: s.name,
        definition: s.definition,
        order_index: s.order_index,
      });
    }
  }

  if (allSkills.length > 0) {
    const { error: skillsError } = await supabase.from("skills").insert(allSkills);
    if (skillsError) {
      console.warn("snapshotFramework: could not batch insert skills", skillsError);
    }
  }
}
