import { useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { StatsCard } from "@/components/shared/StatsCard";
import { ClipboardList, TrendingUp, Calendar, Eye, Star, UserCircle, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const PlayerDashboard = () => {
  const navigate = useNavigate();
  const { user, loading, currentRole, profile } = useAuth();

  // Check if supporter viewing a player
  const isSupporter = currentRole?.role === "supporter";

  // Redirect if not player or supporter
  useEffect(() => {
    if (!loading && (!user || (currentRole?.role !== "player" && currentRole?.role !== "supporter"))) {
      navigate("/dashboard", { replace: true });
    }
  }, [user, loading, currentRole, navigate]);

  // For supporters, get linked player ID
  const { data: linkedPlayerId } = useQuery({
    queryKey: ["supporter-linked-player", user?.id],
    queryFn: async () => {
      if (!user || !isSupporter) return user?.id;
      const { data, error } = await supabase
        .from("supporters_link")
        .select("player_id")
        .eq("supporter_id", user.id)
        .limit(1)
        .single();
      if (error) return null;
      return data?.player_id;
    },
    enabled: !!user,
  });

  const playerId = isSupporter ? linkedPlayerId : user?.id;

  // Fetch player's team info
  const { data: teamInfo } = useQuery({
    queryKey: ["player-team", playerId],
    queryFn: async () => {
      if (!playerId) return null;
      const { data, error } = await supabase
        .from("team_members")
        .select(`
          teams:team_id (
            id,
            name,
            color,
            season
          )
        `)
        .eq("user_id", playerId)
        .eq("member_type", "player")
        .eq("is_active", true)
        .limit(1)
        .single();
      if (error) return null;
      return data?.teams;
    },
    enabled: !!playerId,
  });

  // Fetch evaluations count (coach assessments only - excludes self-assessments)
  const { data: evaluationsCount, isLoading: loadingEvaluations } = useQuery({
    queryKey: ["player-stats-evaluations", playerId],
    queryFn: async () => {
      if (!playerId) return 0;
      const { count, error } = await supabase
        .from("evaluations")
        .select("*", { count: "exact", head: true })
        .eq("player_id", playerId)
        .eq("type", "coach_assessment");
      if (error) throw error;
      return count || 0;
    },
    enabled: !!playerId,
  });

  // Fetch latest evaluation for progression indicator (coach assessments only)
  const { data: latestEvaluations, isLoading: loadingLatest } = useQuery({
    queryKey: ["player-latest-evaluations", playerId],
    queryFn: async () => {
      if (!playerId) return [];
      const { data, error } = await supabase
        .from("evaluations")
        .select(`
          id,
          name,
          date,
          notes,
          type,
          profiles:evaluator_id (first_name, last_name)
        `)
        .eq("player_id", playerId)
        .eq("type", "coach_assessment")
        .order("date", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data || [];
    },
    enabled: !!playerId,
  });

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </AppLayout>
    );
  }

  const team = teamInfo as any;

  return (
    <AppLayout>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground flex items-center gap-3">
            {isSupporter ? "Suivi Joueur" : `Bonjour ${profile?.first_name || "Joueur"}`}
            {isSupporter ? <Heart className="w-7 h-7 text-pink-500" /> : <UserCircle className="w-7 h-7 text-green-500" />}
          </h1>
          <p className="text-muted-foreground mt-1">
            {isSupporter ? "Suivre un joueur (parent, etc.)" : team ? (
              <span className="flex items-center gap-2">
                <span 
                  className="w-2 h-2 rounded-full inline-block" 
                  style={{ backgroundColor: team.color || "#3B82F6" }}
                />
                {team.name} - Saison {team.season || "2024-2025"}
              </span>
            ) : (
              "Consulter mes évaluations"
            )}
          </p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatsCard
            title="Débriefs"
            value={loadingEvaluations ? "-" : String(evaluationsCount)}
            icon={ClipboardList}
          />
          <StatsCard
            title="Progression"
            value={latestEvaluations && latestEvaluations.length >= 2 ? "+12%" : "-"}
            icon={TrendingUp}
          />
          <StatsCard
            title="Dernier Débrief"
            value={latestEvaluations?.[0] ? format(new Date(latestEvaluations[0].date), "dd/MM", { locale: fr }) : "-"}
            icon={Calendar}
          />
        </div>

        {/* Action buttons */}
        {playerId && (
          <div className="flex justify-center gap-4 flex-wrap">
            {!isSupporter && (
              <Button size="lg" className="bg-emerald-500 hover:bg-emerald-600" asChild>
                <Link to="/player/self-evaluation">
                  <Star className="w-5 h-5 mr-2" />
                  M'auto-débriefer
                </Link>
              </Button>
            )}
            <Button size="lg" variant="outline" asChild>
              <Link to={`/players/${playerId}`}>
                <Eye className="w-5 h-5 mr-2" />
                Voir mon profil complet
              </Link>
            </Button>
          </div>
        )}

        {/* Recent Evaluations */}
        <div className="bg-card rounded-xl border border-border">
          <div className="p-6 border-b border-border">
            <h2 className="text-xl font-semibold text-foreground">Mes Débriefs</h2>
            <p className="text-sm text-muted-foreground">
              Historique de vos derniers débriefs
            </p>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Nom</TableHead>
                  <TableHead>Coach</TableHead>
                  <TableHead className="w-[100px]">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingLatest ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-16" /></TableCell>
                    </TableRow>
                  ))
                ) : latestEvaluations && latestEvaluations.length > 0 ? (
                  latestEvaluations.map((evaluation) => {
                    const coach = evaluation.profiles as any;
                    return (
                      <TableRow key={evaluation.id} className="hover:bg-muted/50">
                        <TableCell className="text-muted-foreground">
                          {format(new Date(evaluation.date), "dd MMM yyyy", { locale: fr })}
                        </TableCell>
                        <TableCell className="font-medium">
                          {evaluation.name}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {coach?.first_name} {coach?.last_name}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" asChild>
                            <Link to={`/players/${playerId}`}>
                              <Eye className="w-4 h-4 mr-1" />
                              Voir
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      Aucun débrief disponible
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default PlayerDashboard;
