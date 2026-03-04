import { useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { StatsCard } from "@/components/shared/StatsCard";
import { Building2, Users, Trophy, Plus } from "lucide-react";
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

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { user, loading, isAdmin, profile } = useAuth();

  // Redirect if not admin
  useEffect(() => {
    if (!loading && (!user || !isAdmin)) {
      navigate("/dashboard", { replace: true });
    }
  }, [user, loading, isAdmin, navigate]);

  // Fetch KPI counts with optimized queries
  const { data: clubsCount, isLoading: loadingClubs } = useQuery({
    queryKey: ["admin-stats-clubs"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("clubs")
        .select("*", { count: "exact", head: true })
        .is("deleted_at", null);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!user && isAdmin,
  });

  const { data: teamsCount, isLoading: loadingTeams } = useQuery({
    queryKey: ["admin-stats-teams"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("teams")
        .select("*", { count: "exact", head: true })
        .is("deleted_at", null);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!user && isAdmin,
  });

  const { data: playersCount, isLoading: loadingPlayers } = useQuery({
    queryKey: ["admin-stats-players"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("user_roles")
        .select("*", { count: "exact", head: true })
        .eq("role", "player");
      if (error) throw error;
      return count || 0;
    },
    enabled: !!user && isAdmin,
  });

  // Fetch clubs list with team counts
  const { data: clubs, isLoading: loadingClubsList } = useQuery({
    queryKey: ["admin-clubs-list"],
    queryFn: async () => {
      const { data: clubsData, error: clubsError } = await supabase
        .from("clubs")
        .select("id, name, logo_url, primary_color, referent_name, referent_email")
        .is("deleted_at", null)
        .order("name");

      if (clubsError) throw clubsError;

      // Get team counts for each club
      const clubsWithCounts = await Promise.all(
        (clubsData || []).map(async (club) => {
          const { count } = await supabase
            .from("teams")
            .select("*", { count: "exact", head: true })
            .eq("club_id", club.id)
            .is("deleted_at", null);
          return { ...club, teamsCount: count || 0 };
        })
      );

      return clubsWithCounts;
    },
    enabled: !!user && isAdmin,
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
            Bonjour, {profile?.first_name || "Admin"} 👋
          </h1>
          <p className="text-muted-foreground mt-1">
            Vue d'ensemble de la plateforme
          </p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatsCard
            title="Total Clubs"
            value={loadingClubs ? "-" : String(clubsCount)}
            icon={Building2}
          />
          <StatsCard
            title="Total Équipes"
            value={loadingTeams ? "-" : String(teamsCount)}
            icon={Users}
          />
          <StatsCard
            title="Total Joueurs"
            value={loadingPlayers ? "-" : String(playersCount)}
            icon={Trophy}
          />
        </div>

        {/* Clubs List */}
        <div className="bg-card rounded-xl border border-border">
          <div className="p-6 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Liste des Clubs</h2>
              <p className="text-sm text-muted-foreground">
                Gérez l'ensemble des clubs de la plateforme
              </p>
            </div>
            <Button asChild>
              <Link to="/clubs">
                <Plus className="w-4 h-4 mr-2" />
                Nouveau Club
              </Link>
            </Button>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">Logo</TableHead>
                  <TableHead>Nom du Club</TableHead>
                  <TableHead>Référent</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="text-center">Équipes</TableHead>
                  
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingClubsList ? (
                  // Loading skeleton
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="w-10 h-10 rounded-full" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-8 mx-auto" /></TableCell>
                      
                    </TableRow>
                  ))
                ) : clubs && clubs.length > 0 ? (
                  clubs.map((club) => (
                    <TableRow key={club.id} className="hover:bg-muted/50">
                      <TableCell>
                        <Link to={`/clubs/${club.id}`}>
                          <CircleAvatar
                            name={club.name}
                            imageUrl={club.logo_url}
                            color={club.primary_color}
                            size="sm"
                          />
                        </Link>
                      </TableCell>
                      <TableCell className="font-medium">{club.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {club.referent_name || "-"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {club.referent_email || "-"}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-1 text-sm font-medium bg-primary/10 text-primary rounded-full">
                          {club.teamsCount}
                        </span>
                      </TableCell>


                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      Aucun club enregistré
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

export default AdminDashboard;
