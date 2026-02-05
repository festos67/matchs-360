import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { StatsCard } from "@/components/shared/StatsCard";
import { Activity, Users, Trophy, Target, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";

interface RecentEvaluation {
  id: string;
  name: string;
  date: string;
  player_first_name: string | null;
  player_last_name: string | null;
  player_nickname: string | null;
}

const Stats = () => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalPlayers: 0,
    totalEvaluations: 0,
    averageScore: null as number | null,
    recentEvaluations: [] as RecentEvaluation[],
  });

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    setLoading(true);
    try {
      // Fetch total players (users with role = 'player')
      const { count: playersCount } = await supabase
        .from("user_roles")
        .select("id", { count: "exact", head: true })
        .eq("role", "player");

      // Fetch total evaluations (coach assessments only - excludes self-assessments)
      const { count: evaluationsCount } = await supabase
        .from("evaluations")
        .select("id", { count: "exact", head: true })
        .eq("type", "coach_assessment");

      // Fetch average score (from coach assessments only)
      // First get coach evaluation IDs, then fetch scores
      const { data: coachEvaluations } = await supabase
        .from("evaluations")
        .select("id")
        .eq("type", "coach_assessment");
      
      const coachEvalIds = (coachEvaluations || []).map(e => e.id);
      
      const { data: scoresData } = await supabase
        .from("evaluation_scores")
        .select("score")
        .in("evaluation_id", coachEvalIds.length > 0 ? coachEvalIds : [""])
        .eq("is_not_observed", false)
        .not("score", "is", null)
        .gt("score", 0);

      let averageScore: number | null = null;
      if (scoresData && scoresData.length > 0) {
        const sum = scoresData.reduce((acc, s) => acc + (s.score || 0), 0);
        averageScore = sum / scoresData.length;
      }

      // Fetch recent evaluations with player info (coach assessments only)
      const { data: recentEvals } = await supabase
        .from("evaluations")
        .select(`
          id,
          name,
          date,
          profiles!evaluations_player_id_fkey (
            first_name,
            last_name,
            nickname
          )
        `)
        .eq("type", "coach_assessment")
        .order("date", { ascending: false })
        .limit(5);

      const recentEvaluations: RecentEvaluation[] = (recentEvals || []).map((e: any) => ({
        id: e.id,
        name: e.name,
        date: e.date,
        player_first_name: e.profiles?.first_name,
        player_last_name: e.profiles?.last_name,
        player_nickname: e.profiles?.nickname,
      }));

      setStats({
        totalPlayers: playersCount || 0,
        totalEvaluations: evaluationsCount || 0,
        averageScore,
        recentEvaluations,
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
    } finally {
      setLoading(false);
    }
  };

  const getPlayerName = (eval_: RecentEvaluation) => {
    if (eval_.player_nickname) return eval_.player_nickname;
    if (eval_.player_first_name || eval_.player_last_name) {
      return `${eval_.player_first_name || ""} ${eval_.player_last_name || ""}`.trim();
    }
    return "Joueur inconnu";
  };

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), "d MMM yyyy", { locale: fr });
    } catch {
      return dateString;
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Statistiques</h1>
          <p className="text-muted-foreground">
            Vue d'ensemble des performances et métriques
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {loading ? (
            <>
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
            </>
          ) : (
            <>
              <StatsCard
                title="Total Joueurs"
                value={stats.totalPlayers.toString()}
                icon={Users}
                color="primary"
              />
              <StatsCard
                title="Débriefs"
                value={stats.totalEvaluations.toString()}
                icon={Trophy}
                color="success"
              />
              <StatsCard
                title="Score Moyen"
                value={stats.averageScore ? `${stats.averageScore.toFixed(1)}/5` : "-"}
                icon={Target}
                color="warning"
              />
              <StatsCard
                title="Progression"
                value="-"
                icon={Activity}
                color="primary"
              />
            </>
          )}
        </div>

        <div className="rounded-lg border bg-card p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Derniers débriefs
          </h2>
          
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : stats.recentEvaluations.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <Activity className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p>Aucune évaluation enregistrée pour le moment.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {stats.recentEvaluations.map((evaluation) => (
                <div
                  key={evaluation.id}
                  className="flex items-center justify-between py-3 px-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                >
                  <div className="flex flex-col">
                    <span className="font-medium">{getPlayerName(evaluation)}</span>
                    <span className="text-sm text-muted-foreground">{evaluation.name}</span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {formatDate(evaluation.date)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
};

export default Stats;
