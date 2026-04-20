import { useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { StatsCard } from "@/components/shared/StatsCard";
import { CircleAvatar } from "@/components/shared/CircleAvatar";
import { Users, UserCog, UserCircle, Heart, Building2, BookOpen, Printer } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { PrintableFramework } from "@/components/framework/PrintableFramework";
import { useReactToPrint } from "react-to-print";

const CoachMyClub = () => {
  const navigate = useNavigate();
  const { user, loading, currentRole, profile } = useAuth();

  useEffect(() => {
    if (!loading && (!user || currentRole?.role !== "coach")) {
      navigate("/dashboard", { replace: true });
    }
  }, [user, loading, currentRole, navigate]);

  const clubId = currentRole?.club_id;

  // Fetch club info
  const { data: club } = useQuery({
    queryKey: ["coach-club", clubId],
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

  // Fetch all active teams in the club
  const { data: clubTeams, isLoading: loadingTeams } = useQuery({
    queryKey: ["coach-club-teams", clubId],
    queryFn: async () => {
      if (!clubId) return [];
      const { data, error } = await supabase
        .from("teams")
        .select("*")
        .eq("club_id", clubId)
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!clubId,
  });

  const teamIds = clubTeams?.map((t) => t.id) || [];

  // Fetch team members for all club teams
  const { data: allMembers, isLoading: loadingMembers } = useQuery({
    queryKey: ["coach-club-members", teamIds],
    queryFn: async () => {
      if (teamIds.length === 0) return [];
      const { data, error } = await supabase
        .from("team_members")
        .select(`
          id, team_id, member_type, is_active, coach_role,
          profiles:user_id (id, first_name, last_name, photo_url)
        `)
        .in("team_id", teamIds)
        .eq("is_active", true);
      if (error) throw error;
      return data || [];
    },
    enabled: teamIds.length > 0,
  });

  // Count coaches in the club
  const { data: coachCount, isLoading: loadingCoaches } = useQuery({
    queryKey: ["coach-club-coach-count", clubId],
    queryFn: async () => {
      if (!clubId) return 0;
      const { data, error } = await supabase
        .from("user_roles")
        .select("id", { count: "exact", head: true })
        .eq("club_id", clubId)
        .eq("role", "coach");
      if (error) throw error;
      return data ?? 0;
    },
    enabled: !!clubId,
  });

  // Count coaches properly
  const { data: coachesCount } = useQuery({
    queryKey: ["coach-club-coaches-count", clubId],
    queryFn: async () => {
      if (!clubId) return 0;
      const { count, error } = await supabase
        .from("user_roles")
        .select("*", { count: "exact", head: true })
        .eq("club_id", clubId)
        .eq("role", "coach");
      if (error) throw error;
      return count || 0;
    },
    enabled: !!clubId,
  });

  // Count supporters
  const { data: supportersCount } = useQuery({
    queryKey: ["coach-club-supporters-count", clubId],
    queryFn: async () => {
      if (!clubId) return 0;
      const { count, error } = await supabase
        .from("user_roles")
        .select("*", { count: "exact", head: true })
        .eq("club_id", clubId)
        .eq("role", "supporter");
      if (error) throw error;
      return count || 0;
    },
    enabled: !!clubId,
  });

  // Compute stats
  const totalPlayers = allMembers?.filter((m) => m.member_type === "player").length || 0;

  // Build team info with referent coach and player count
  const teamsWithInfo = (clubTeams || []).map((team) => {
    const members = allMembers?.filter((m) => m.team_id === team.id) || [];
    const playerCount = members.filter((m) => m.member_type === "player").length;
    const referentCoach = members.find(
      (m) => m.member_type === "coach" && m.coach_role === "referent"
    );
    const referentProfile = referentCoach?.profiles as any;

    return {
      ...team,
      playerCount,
      referentCoachName: referentProfile
        ? `${referentProfile.first_name || ""} ${referentProfile.last_name || ""}`.trim()
        : "—",
    };
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
          <h1 className="text-3xl font-display font-bold text-foreground flex items-center gap-3">
            <Building2 className="w-7 h-7 text-primary" />
            {club?.name || "Mon Club"}
          </h1>
          <p className="text-muted-foreground mt-1">
            Vue d'ensemble du club
          </p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatsCard
            title="Coachs"
            value={coachesCount != null ? String(coachesCount) : "-"}
            icon={UserCog}
          />
          <StatsCard
            title="Équipes"
            value={loadingTeams ? "-" : String(clubTeams?.length || 0)}
            icon={Users}
          />
          <StatsCard
            title="Joueurs"
            value={loadingMembers ? "-" : String(totalPlayers)}
            icon={UserCircle}
          />
          <StatsCard
            title="Supporters"
            value={supportersCount != null ? String(supportersCount) : "-"}
            icon={Heart}
          />
        </div>

        {/* Teams circles */}
        <div className="bg-card rounded-xl border border-border p-6">
          <h2 className="text-xl font-semibold text-foreground mb-6">Équipes du club</h2>

          {loadingTeams || loadingMembers ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex flex-col items-center gap-2">
                  <Skeleton className="w-24 h-24 rounded-full" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-3 w-16" />
                </div>
              ))}
            </div>
          ) : teamsWithInfo.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
              {teamsWithInfo.map((team) => (
                <Link key={team.id} to={`/teams/${team.id}`} className="group">
                  <div className="flex flex-col items-center text-center">
                    <CircleAvatar
                      shape="square"
                      name={team.name}
                      shortName={team.short_name}
                      color={team.color || "#3B82F6"}
                      size="md"
                      showName={false}
                    />
                    <p className="font-semibold text-foreground mt-2 group-hover:text-primary transition-colors text-sm">
                      {team.name}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {team.short_name || ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Coach : {team.referentCoachName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {team.playerCount} joueur{team.playerCount > 1 ? "s" : ""}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">
              Aucune équipe dans ce club
            </p>
          )}
        </div>
      </div>
    </AppLayout>
  );
};

export default CoachMyClub;
