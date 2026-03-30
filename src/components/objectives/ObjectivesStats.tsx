import { useQuery } from "@tanstack/react-query";
import { Check, X, Target } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface ObjectivesStatsProps {
  teamId: string;
}

export function ObjectivesStats({ teamId }: ObjectivesStatsProps) {
  const { data } = useQuery({
    queryKey: ["team-objectives-stats", teamId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("team_objectives")
        .select("status")
        .eq("team_id", teamId);
      if (error) throw error;
      const succeeded = (data || []).filter((o: any) => o.status === "succeeded").length;
      const missed = (data || []).filter((o: any) => o.status === "missed").length;
      const finalized = succeeded + missed;
      const total = (data || []).length;
      const percentage = finalized > 0 ? Math.round((succeeded / finalized) * 100) : null;
      return { succeeded, missed, finalized, total, percentage };
    },
  });

  return (
    <div className="glass-card p-4">
      <p className="text-sm font-display font-semibold text-foreground uppercase tracking-wide mb-2">Bilan des objectifs</p>
      {!data || data.total === 0 ? (
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
            <Target className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-2xl font-display font-bold text-muted-foreground">N/A</p>
            <p className="text-xs text-muted-foreground mt-0.5">Aucun objectif finalisé</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <Check className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-display font-bold text-emerald-600">{data.succeeded}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Réussi{data.succeeded > 1 ? "s" : ""}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center">
              <X className="w-5 h-5 text-destructive" />
            </div>
            <div>
              <p className="text-2xl font-display font-bold text-destructive">{data.missed}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Manqué{data.missed > 1 ? "s" : ""}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
