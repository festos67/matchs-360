import { supabase } from "@/integrations/supabase/client";

/**
 * Creates an archived snapshot of the current framework (with all themes and skills)
 * before applying changes. This preserves the previous version in the history.
 * Optimised: 3 queries total (1 framework + 1 batch themes + 1 batch skills).
 */
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
  const allSkills: { theme_id: string; name: string; definition: string | null; order_index: number }[] = [];

  for (let i = 0; i < themes.length; i++) {
    const originalTheme = themes[i];
    const newTheme = newThemes[i];
    const skills = originalTheme.skills || [];

    for (const s of skills) {
      allSkills.push({
        theme_id: newTheme.id,
        name: (s as any).name,
        definition: (s as any).definition,
        order_index: (s as any).order_index,
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
