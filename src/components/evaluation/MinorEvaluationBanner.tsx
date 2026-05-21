import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Shield } from "lucide-react";

/**
 * Phase 4 RGPD — Affiché au coach lorsqu'il évalue un mineur.
 * Rappelle la traçabilité parentale et la charte de bienveillance.
 */
export function MinorEvaluationBanner({ playerId }: { playerId: string }) {
  const { data: isMinor } = useQuery({
    queryKey: ["is-minor", playerId],
    queryFn: async () => {
      if (!playerId) return false;
      const { data, error } = await supabase.rpc("is_minor", { _profile_id: playerId } as any);
      if (error) return false;
      return Boolean(data);
    },
    enabled: !!playerId,
    staleTime: 5 * 60 * 1000,
  });

  if (!isMinor) return null;

  return (
    <div className="p-3 bg-blue-500/10 border-l-4 border-blue-500 rounded-r flex items-start gap-2">
      <Shield className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
      <div className="text-sm">
        <p className="font-medium text-blue-700 dark:text-blue-400">
          Joueur mineur — débrief notifié au représentant légal
        </p>
        <p className="text-muted-foreground mt-1">
          Vos commentaires seront transmis au titulaire de l'autorité parentale.
          Restez factuel et bienveillant (Charte du sport). Tout terme inapproprié
          sera automatiquement rejeté.
        </p>
      </div>
    </div>
  );
}