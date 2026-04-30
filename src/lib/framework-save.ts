/**
 * @module framework-save
 * @description Sauvegarde atomique d'un référentiel via RPC `save_framework_atomic`.
 *              Toutes les opérations (update name, upsert thèmes/skills, suppressions
 *              cascade) s'exécutent en une seule transaction côté DB → une seule
 *              requête HTTP, pas de statement_timeout.
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

export async function saveFrameworkChanges(
  frameworkId: string,
  confirmedName: string,
  themesToSave: SaveTheme[],
): Promise<void> {
  // Sérialise le payload pour la RPC. is_new explicite (côté SQL on lit
  // (v->>'is_new')::boolean qui retourne null si absent → traité comme false).
  const payload = themesToSave.map((t) => ({
    id: t.isNew ? null : t.id,
    name: t.name,
    color: t.color,
    order_index: t.order_index,
    is_new: !!t.isNew,
    skills: t.skills.map((s) => ({
      id: s.isNew ? null : s.id,
      name: s.name,
      definition: s.definition,
      order_index: s.order_index,
      is_new: !!s.isNew,
    })),
  }));

  const { error } = await supabase.rpc("save_framework_atomic", {
    p_framework_id: frameworkId,
    p_name: confirmedName,
    // supabase-js sérialise automatiquement en jsonb
    p_themes: payload as unknown as never,
  });

  if (error) throw error;
}
