import { supabase } from "@/integrations/supabase/client";

/**
 * Creates an archived snapshot of the current framework (with all themes and skills)
 * before applying changes. This preserves the previous version in the history.
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

  // 2. Fetch themes with skills before creating snapshot
  const { data: themes } = await supabase
    .from("themes")
    .select("*, skills(*)")
    .eq("framework_id", frameworkId)
    .order("order_index");

  // If no themes, skip snapshot (nothing meaningful to archive)
  if (!themes || themes.length === 0) return;

  // 3. Create archived copy of the framework
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

  // 4. Clone themes and skills into the archived framework
  for (const theme of themes) {
    const { data: newTheme, error: themeError } = await supabase
      .from("themes")
      .insert({
        framework_id: archivedFw.id,
        name: theme.name,
        color: theme.color,
        order_index: theme.order_index,
      })
      .select()
      .maybeSingle();

    if (themeError || !newTheme) {
      console.warn("snapshotFramework: could not copy theme", theme.name, themeError);
      continue;
    }

    const skills = theme.skills || [];
    if (skills.length > 0) {
      const { error: skillsError } = await supabase.from("skills").insert(
        skills.map((s: any) => ({
          theme_id: newTheme.id,
          name: s.name,
          definition: s.definition,
          order_index: s.order_index,
        }))
      );
      if (skillsError) {
        console.warn("snapshotFramework: could not copy skills for theme", theme.name, skillsError);
      }
    }
  }
}
