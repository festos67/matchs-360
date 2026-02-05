import { useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { StatsCard } from "@/components/shared/StatsCard";
import { Users, ClipboardList, Trophy, Eye, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CircleAvatar } from "@/components/shared/CircleAvatar";
import { Skeleton } from "@/components/ui/skeleton";

const CoachDashboard = () => {
  const navigate = useNavigate();
  const { user, loading, currentRole, profile } = useAuth();

  // Redirect if not coach
  useEffect(() => {
    if (!loading && (!user || currentRole?.role !== "coach")) {
      navigate("/dashboard", { replace: true });
    }
  }, [user, loading, currentRole, navigate]);

  // Fetch coach's teams
  const { data: myTeams, isLoading: loadingTeams } = useQuery({
    queryKey: ["coach-teams", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("team_members")
        .select(`
          team_id,
          coach_role,
          teams:team_id (
            id,
            name,
            color,
            season
          )
        `)
        .eq("user_id", user.id)
        .eq("member_type", "coach")
        .eq("is_active", true);

      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const teamIds = myTeams?.map(t => t.team_id) || [];

  // Fetch players count
  const { data: playersCount, isLoading: loadingPlayers } = useQuery({
    queryKey: ["coach-stats-players", teamIds],
    queryFn: async () => {
      if (teamIds.length === 0) return 0;
      const { count, error } = await supabase
        .from("team_members")
        .select("*", { count: "exact", head: true })
        .in("team_id", teamIds)
        .eq("member_type", "player")
        .eq("is_active", true);
      if (error) throw error;
      return count || 0;
    },
    enabled: teamIds.length > 0,
  });

  // Fetch evaluations count
  const { data: evaluationsCount, isLoading: loadingEvaluations } = useQuery({
    queryKey: ["coach-stats-evaluations", user?.id],
    queryFn: async () => {
      if (!user) return 0;
      const { count, error } = await supabase
        .from("evaluations")
        .select("*", { count: "exact", head: true })
        .eq("coach_id", user.id);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!user,
  });

  // Fetch players list from my teams
  const { data: players, isLoading: loadingPlayersList } = useQuery({
    queryKey: ["coach-players-list", teamIds],
    queryFn: async () => {
      if (teamIds.length === 0) return [];
      
      const { data, error } = await supabase
        .from("team_members")
        .select(`
          id,
          team_id,
          teams:team_id (name, color),
          profiles:user_id (
            id,
            first_name,
            last_name,
            photo_url,
            email
          )
        `)
        .in("team_id", teamIds)
        .eq("member_type", "player")
        .eq("is_active", true);

      if (error) throw error;
      
      // Get evaluation counts for each player
      const playersWithCounts = await Promise.all(
        (data || []).map(async (member) => {
          const { count } = await supabase
            .from("evaluations")
            .select("*", { count: "exact", head: true })
            .eq("player_id", (member.profiles as any)?.id);
          
          return {
            ...member,
            evaluationsCount: count || 0
          };
        })
      );

      return playersWithCounts;
    },
    enabled: teamIds.length > 0,
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

  return (
    <AppLayout>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">
            Bonjour, Coach {profile?.first_name || ""} 🏆
          </h1>
          <p className="text-muted-foreground mt-1">
            Gérez vos équipes et suivez la progression de vos joueurs
          </p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatsCard
            title="Mes Équipes"
            value={loadingTeams ? "-" : String(myTeams?.length || 0)}
            icon={Users}
          />
          <StatsCard
            title="Joueurs"
            value={loadingPlayers ? "-" : String(playersCount)}
            icon={Trophy}
          />
          <StatsCard
            title="Débriefs"
            value={loadingEvaluations ? "-" : String(evaluationsCount)}
            icon={ClipboardList}
          />
        </div>

        {/* Players List */}
        <div className="bg-card rounded-xl border border-border">
          <div className="p-6 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Mes Joueurs</h2>
              <p className="text-sm text-muted-foreground">
                Suivez et évaluez la progression de chaque joueur
              </p>
            </div>
            <Button asChild>
              <Link to="/evaluations">
                <Plus className="w-4 h-4 mr-2" />
                Nouveau Débrief
              </Link>
            </Button>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">Photo</TableHead>
                  <TableHead>Joueur</TableHead>
                  <TableHead>Équipe</TableHead>
                  <TableHead className="text-center">Évaluations</TableHead>
                  <TableHead className="w-[100px]">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingPlayersList ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="w-10 h-10 rounded-full" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-8 mx-auto" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-16" /></TableCell>
                    </TableRow>
                  ))
                ) : players && players.length > 0 ? (
                  players.map((member) => {
                    const playerProfile = member.profiles as any;
                    const team = member.teams as any;
                    return (
                      <TableRow key={member.id} className="hover:bg-muted/50">
                        <TableCell>
                          <CircleAvatar
                            name={`${playerProfile?.first_name || ""} ${playerProfile?.last_name || ""}`}
                            imageUrl={playerProfile?.photo_url}
                            size="sm"
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          {playerProfile?.first_name} {playerProfile?.last_name}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-2 h-2 rounded-full" 
                              style={{ backgroundColor: team?.color || "#3B82F6" }}
                            />
                            <span className="text-muted-foreground">{team?.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-1 text-sm font-medium bg-primary/10 text-primary rounded-full">
                            {member.evaluationsCount}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" asChild>
                            <Link to={`/players/${playerProfile?.id}`}>
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
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      Aucun joueur dans vos équipes
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

export default CoachDashboard;
