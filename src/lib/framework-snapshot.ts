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
    .single();

  if (fwError || !fw) throw new Error("Framework not found");

  // 2. Create archived copy of the framework
  const { data: archivedFw, error: copyError } = await supabase
    .from("competence_frameworks")
    .insert({
      name: fw.name,
      club_id: fw.club_id,
      team_id: fw.team_id,
      is_template: fw.is_template,
      is_archived: true,
      archived_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (copyError || !archivedFw) throw new Error("Failed to create snapshot");

  // 3. Fetch themes with skills
  const { data: themes } = await supabase
    .from("themes")
    .select("*, skills(*)")
    .eq("framework_id", frameworkId)
    .order("order_index");

  if (!themes || themes.length === 0) return;

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
      .single();

    if (themeError || !newTheme) continue;

    const skills = theme.skills || [];
    if (skills.length > 0) {
      await supabase.from("skills").insert(
        skills.map((s: any) => ({
          theme_id: newTheme.id,
          name: s.name,
          definition: s.definition,
          order_index: s.order_index,
        }))
      );
    }
  }
}
