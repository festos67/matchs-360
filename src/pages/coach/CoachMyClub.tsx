/**
 * @page CoachMyClub
 * @route /coach/my-club
 *
 * Vue d'ensemble du club pour le Coach (KPI + galerie d'équipes).
 * (mem://features/coach/club-overview-dashboard)
 *
 * @description
 * Première entrée du menu coach. Présente l'organisation globale du club
 * (équipes, coachs, joueurs) sans permettre l'édition. Sert de hub de
 * navigation visuelle vers les fiches équipes/joueurs.
 *
 * @sections
 * - KPI : nombre d'équipes, joueurs, débriefs du mois
 * - Mes Coachs : liste de tous les coachs du club avec leur rôle
 *   (mem://logic/club-coach-scope)
 * - Galerie d'équipes : cartes cliquables vers TeamDetail
 *
 * @access Coach (Référent ou Assistant)
 *
 * @maintenance
 * Affiche aussi le logo du club pré-chargé en base64 pour les exports PDF
 * éventuels.
 */
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

  // Fetch club framework (active template) + themes for printing
  const { data: clubFramework } = useQuery({
    queryKey: ["coach-club-framework", clubId],
    queryFn: async () => {
      if (!clubId) return null;
      const { data: fw } = await supabase
        .from("competence_frameworks")
        .select("id, name")
        .eq("club_id", clubId)
        .eq("is_template", true)
        .eq("is_archived", false)
        .maybeSingle();
      if (!fw) return null;
      const { data: themes } = await supabase
        .from("themes")
        .select("*, skills(*)")
        .eq("framework_id", fw.id)
        .order("order_index");
      const themesArr = (themes || []).map((t: any) => ({
        ...t,
        skills: (t.skills || []).sort((a: any, b: any) => a.order_index - b.order_index),
      }));
      const skillsTotal = themesArr.reduce((s: number, t: any) => s + (t.skills?.length || 0), 0);
      return { id: fw.id, name: fw.name, themes: themesArr, themes_count: themesArr.length, skills_count: skillsTotal };
    },
    enabled: !!clubId,
  });

  const printRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: clubFramework?.name || "Référentiel du Club",
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

        {/* Référentiel du club */}
        {clubFramework && clubId && (
          <div>
            <h2 className="text-xl font-semibold text-foreground mb-3">Référentiel du club</h2>
          <button
            type="button"
            onClick={() => navigate(`/clubs/${clubId}/framework`)}
            className="w-full text-left bg-card rounded-xl border border-border p-4 hover:border-primary/50 hover:shadow-sm transition-all flex items-center gap-4"
          >
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <BookOpen className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground truncate">{clubFramework.name}</p>
              <p className="text-xs text-muted-foreground">
                {clubFramework.themes_count} thématique{clubFramework.themes_count > 1 ? "s" : ""} • {clubFramework.skills_count} compétence{clubFramework.skills_count > 1 ? "s" : ""}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handlePrint();
              }}
            >
              <Printer className="w-4 h-4 mr-2 text-orange-500" />
              Imprimer
            </Button>
          </button>
          </div>
        )}

        {/* Teams circles */}
        <div>
          <h2 className="text-xl font-semibold text-foreground mb-6">Équipes du club</h2>

          {loadingTeams || loadingMembers ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex flex-col items-center gap-2">
                  <Skeleton className="w-full aspect-square max-w-[7rem] rounded-2xl" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-3 w-16" />
                </div>
              ))}
            </div>
          ) : teamsWithInfo.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-6">
              {teamsWithInfo.map((team) => (
                <Link key={team.id} to={`/teams/${team.id}`} className="group">
                  <div className="flex flex-col items-center text-center">
                    <div
                      className="w-full aspect-square max-w-[7rem] rounded-2xl flex items-center justify-center font-display font-bold text-white text-[clamp(1rem,4vw,1.75rem)] transition-transform group-hover:-translate-y-0.5 group-hover:shadow-lg"
                      style={{
                        background: `linear-gradient(135deg, ${team.color || "#3B82F6"} 0%, ${team.color || "#3B82F6"}88 100%)`,
                      }}
                    >
                      {team.short_name ||
                        team.name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                    </div>
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

      {/* Hidden printable */}
      {clubFramework && (
        <div style={{ position: "fixed", left: "-9999px", top: 0 }}>
          <PrintableFramework
            ref={printRef}
            frameworkName={clubFramework.name}
            teamName="Modèle du club"
            clubName={club?.name || ""}
            clubLogoUrl={club?.logo_url}
            themes={clubFramework.themes}
          />
        </div>
      )}
    </AppLayout>
  );
};

export default CoachMyClub;
