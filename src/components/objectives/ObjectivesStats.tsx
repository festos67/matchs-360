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
      const total = (data || []).length;
      return { succeeded, missed, total };
    },
  });

  if (!data || data.total === 0) return null;

  return (
    <div className="glass-card p-4">
      <div className="flex items-center gap-3 mb-3">
        <Target className="w-5 h-5 text-primary" />
        <h3 className="font-semibold text-sm">Bilan des objectifs</h3>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
            <Check className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-emerald-600">{data.succeeded}</p>
            <p className="text-xs text-muted-foreground">Réussi{data.succeeded > 1 ? "s" : ""}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center">
            <X className="w-5 h-5 text-destructive" />
          </div>
          <div>
            <p className="text-2xl font-bold text-destructive">{data.missed}</p>
            <p className="text-xs text-muted-foreground">Manqué{data.missed > 1 ? "s" : ""}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
