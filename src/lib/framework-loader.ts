import { supabase } from "@/integrations/supabase/client";

export interface FrameworkTheme {
  id: string;
  name: string;
  color: string | null;
  order_index: number;
  skills: FrameworkSkill[];
}

export interface FrameworkSkill {
  id: string;
  name: string;
  definition: string | null;
  order_index: number;
}

/**
 * Load themes for a framework, with automatic fallback to framework_snapshots
 * if the framework has been purged from the live tables.
 * 
 * Returns { themes, fromSnapshot } so callers can indicate stale data.
 */
export async function loadFrameworkThemes(
  frameworkId: string
): Promise<{ themes: FrameworkTheme[]; fromSnapshot: boolean }> {
  // 1. Try live tables
  const { data: themesData } = await supabase
    .from("themes")
    .select("*, skills(*)")
    .eq("framework_id", frameworkId)
    .order("order_index");

  if (themesData && themesData.length > 0) {
    const sorted: FrameworkTheme[] = themesData.map((theme) => ({
      id: theme.id,
      name: theme.name,
      color: theme.color,
      order_index: theme.order_index,
      skills: ((theme.skills as unknown as FrameworkSkill[]) || []).sort(
        (a, b) => a.order_index - b.order_index
      ),
    }));
    return { themes: sorted, fromSnapshot: false };
  }

  // 2. Fallback: load from framework_snapshots
  const { data: snapshot } = await supabase
    .from("framework_snapshots")
    .select("snapshot")
    .eq("framework_id", frameworkId)
    .maybeSingle();

  if (snapshot?.snapshot) {
    const parsed = snapshot.snapshot as { name?: string; themes?: Array<{ id?: string; name: string; color?: string; skills?: Array<{ id?: string; name: string; definition?: string }> }> };
    const snapshotThemes: FrameworkTheme[] = (parsed.themes || []).map(
      (t, index) => ({
        id: t.id || `snapshot-theme-${index}`,
        name: t.name,
        color: t.color || null,
        order_index: index,
        skills: (t.skills || []).map((s, sIndex) => ({
          id: s.id || `snapshot-skill-${index}-${sIndex}`,
          name: s.name,
          definition: s.definition || null,
          order_index: sIndex,
        })),
      })
    );
    return { themes: snapshotThemes, fromSnapshot: true };
  }

  // 3. Nothing found
  return { themes: [], fromSnapshot: false };
}
