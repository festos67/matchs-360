/**
 * Enfants dont l'utilisateur connecté est représentant légal (consentement
 * parental non révoqué). Liste vide pour tous les autres utilisateurs.
 *
 * Même clé de cache que le tableau de bord supporter : une seule requête.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useMyChildren() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-children-ids", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_children");
      if (error) return [] as string[];
      return (data ?? []) as unknown as string[];
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });
}
