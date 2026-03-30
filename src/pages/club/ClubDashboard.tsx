import { useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { StatsCard } from "@/components/shared/StatsCard";
import { Users, Trophy, UserCheck, Eye, Plus } from "lucide-react";
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

const ClubDashboard = () => {
  const navigate = useNavigate();
  const { user, loading, currentRole, profile } = useAuth();

  // Get club_id from current role
  const clubId = currentRole?.club_id;

  // Redirect if not club_admin
  useEffect(() => {
    if (!loading && (!user || currentRole?.role !== "club_admin")) {
      navigate("/dashboard", { replace: true });
    }
  }, [user, loading, currentRole, navigate]);

  // Fetch club info
  const { data: club } = useQuery({
    queryKey: ["club-info", clubId],
    queryFn: async () => {
      if (!clubId) return null;
      const { data, error } = await supabase
        .from("clubs")
        .select("*")
        .eq("id", clubId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!clubId,
  });

  // Fetch teams count
  const { data: teamsCount, isLoading: loadingTeams } = useQuery({
    queryKey: ["club-stats-teams", clubId],
    queryFn: async () => {
      if (!clubId) return 0;
      const { count, error } = await supabase
        .from("teams")
        .select("*", { count: "exact", head: true })
        .eq("club_id", clubId)
        .is("deleted_at", null);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!clubId,
  });

  // Fetch players count in club teams
  const { data: playersCount, isLoading: loadingPlayers } = useQuery({
    queryKey: ["club-stats-players", clubId],
    queryFn: async () => {
      if (!clubId) return 0;
      const { data: teams } = await supabase
        .from("teams")
        .select("id")
        .eq("club_id", clubId)
        .is("deleted_at", null);
      
      if (!teams || teams.length === 0) return 0;
      
      const teamIds = teams.map(t => t.id);
      const { count, error } = await supabase
        .from("team_members")
        .select("*", { count: "exact", head: true })
        .in("team_id", teamIds)
        .eq("member_type", "player")
        .eq("is_active", true);
      
      if (error) throw error;
      return count || 0;
    },
    enabled: !!clubId,
  });

  // Fetch coaches count
  const { data: coachesCount, isLoading: loadingCoaches } = useQuery({
    queryKey: ["club-stats-coaches", clubId],
    queryFn: async () => {
      if (!clubId) return 0;
      const { data: teams } = await supabase
        .from("teams")
        .select("id")
        .eq("club_id", clubId)
        .is("deleted_at", null);
      
      if (!teams || teams.length === 0) return 0;
      
      const teamIds = teams.map(t => t.id);
      const { count, error } = await supabase
        .from("team_members")
        .select("*", { count: "exact", head: true })
        .in("team_id", teamIds)
        .eq("member_type", "coach")
        .eq("is_active", true);
      
      if (error) throw error;
      return count || 0;
    },
    enabled: !!clubId,
  });

  // Fetch teams list
  const { data: teams, isLoading: loadingTeamsList } = useQuery({
    queryKey: ["club-teams-list", clubId],
    queryFn: async () => {
      if (!clubId) return [];
      const { data: teamsData, error } = await supabase
        .from("teams")
        .select("id, name, color, season, description")
        .eq("club_id", clubId)
        .is("deleted_at", null)
        .order("name");

      if (error) throw error;

      // Get member counts for each team
      const teamsWithCounts = await Promise.all(
        (teamsData || []).map(async (team) => {
          const { count: playersCount } = await supabase
            .from("team_members")
            .select("*", { count: "exact", head: true })
            .eq("team_id", team.id)
            .eq("member_type", "player")
            .eq("is_active", true);
          
          const { count: coachesCount } = await supabase
            .from("team_members")
            .select("*", { count: "exact", head: true })
            .eq("team_id", team.id)
            .eq("member_type", "coach")
            .eq("is_active", true);

          return { 
            ...team, 
            playersCount: playersCount || 0,
            coachesCount: coachesCount || 0
          };
        })
      );

      return teamsWithCounts;
    },
    enabled: !!clubId,
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
            Bonjour {profile?.first_name || "Administrateur"} 🏢
          </h1>
          <p className="text-muted-foreground mt-1">
            Gérer mon club et ses équipes
          </p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatsCard
            title="Équipes"
            value={loadingTeams ? "-" : String(teamsCount)}
            icon={Users}
          />
          <StatsCard
            title="Joueurs"
            value={loadingPlayers ? "-" : String(playersCount)}
            icon={Trophy}
          />
          <StatsCard
            title="Coachs"
            value={loadingCoaches ? "-" : String(coachesCount)}
            icon={UserCheck}
          />
        </div>

        {/* Teams List */}
        <div className="bg-card rounded-xl border border-border">
          <div className="p-6 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Mes Équipes</h2>
              <p className="text-sm text-muted-foreground">
                Gérez les équipes de votre club
              </p>
            </div>
            <Button asChild>
              <Link to={clubId ? `/clubs/${clubId}` : "/clubs"}>
                <Plus className="w-4 h-4 mr-2" />
                Nouvelle Équipe
              </Link>
            </Button>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Équipe</TableHead>
                  <TableHead>Saison</TableHead>
                  <TableHead className="text-center">Joueurs</TableHead>
                  <TableHead className="text-center">Coachs</TableHead>
                  <TableHead className="w-[100px]">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingTeamsList ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-8 mx-auto" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-8 mx-auto" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-16" /></TableCell>
                    </TableRow>
                  ))
                ) : teams && teams.length > 0 ? (
                  teams.map((team) => (
                    <TableRow key={team.id} className="hover:bg-muted/50">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: team.color || "#3B82F6" }}
                          />
                          <span className="font-medium">{team.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {team.season || "-"}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-1 text-sm font-medium bg-primary/10 text-primary rounded-full">
                          {team.playersCount}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-1 text-sm font-medium bg-secondary/50 text-secondary-foreground rounded-full">
                          {team.coachesCount}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" asChild>
                          <Link to={`/teams/${team.id}`}>
                            <Eye className="w-4 h-4 mr-1" />
                            Voir
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      Aucune équipe enregistrée
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

export default ClubDashboard;
