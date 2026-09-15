/**
 * @page CoachMyClub
 * @route /coach/my-club
 *
 * Page d'accueil « Mon club » du Coach.
 * (mem://features/coach/club-overview-dashboard)
 *
 * @description
 * Première entrée du menu coach. Reprend, de haut en bas, la structure de la
 * page « Mon club » du responsable club, pour que les deux rôles retrouvent
 * la même lecture :
 *   1. Titre « Bonjour <prénom nom> » (même police que le responsable club)
 *   2. Sous-titre
 *   3. Encart du club : logo + équipes, coachs, joueurs, supporters, utilisateurs
 *   4. Mon tableau de bord : mes équipes, mes joueurs, mes supporters
 *   5. Référentiel du club (lecture seule)
 *   6. Équipes du club
 *
 * @access Coach (Référent ou Assistant). Aucune édition possible ici.
 *
 * @maintenance
 * - Tous les chiffres viennent de la fonction serveur
 *   get_coach_my_club_dashboard_stats : les règles d'accès limitent un coach à
 *   ses propres équipes, un comptage côté navigateur serait donc faux.
 * - La galerie montre TOUTES les équipes du club : les règles d'accès ouvrent
 *   aux coachs du club la lecture des équipes qu'ils n'encadrent pas
 *   (migration club_coaches_read_only_team_view). La fiche équipe s'ouvre
 *   alors en lecture seule — TeamDetail, isClubCoachViewing.
 */
import { useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { StatsCard } from "@/components/shared/StatsCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Users,
  UserCog,
  UserCircle,
  Heart,
  Building2,
  BookOpen,
  Printer,
  Shield,
  Eye,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { PrintableFramework } from "@/components/framework/PrintableFramework";
import { useReactToPrint } from "react-to-print";

type CoachClubStats = {
  my_teams: number;
  my_players: number;
  my_supporters: number;
  total_teams: number;
  total_coaches: number;
  total_players: number;
  total_supporters: number;
  total_users: number;
};

const plural = (n: number, singular: string, pluralForm = `${singular}s`) =>
  `${n} ${n > 1 ? pluralForm : singular}`;

const CoachMyClub = () => {
  const navigate = useNavigate();
  const { user, loading, currentRole, profile } = useAuth();
  const isCoachRole = currentRole?.role === "coach";

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate("/auth", { replace: true });
      return;
    }
    // Ne rediriger que si un rôle est explicitement actif et n'est pas autorisé.
    // Pendant la transition post-login, currentRole peut être null un instant ;
    // ProtectedRoute aligne déjà le rôle automatiquement.
    if (currentRole && !["coach", "admin", "club_admin"].includes(currentRole.role)) {
      navigate("/dashboard", { replace: true });
    }
  }, [user, loading, currentRole, navigate]);

  const rawClubId = currentRole?.club_id;

  // Certains comptes historiques conservent un rôle "coach" sur un club où
  // leurs affectations d'équipe ont depuis été archivées. La résolution se fait
  // côté backend pour ne pas dépendre des règles de visibilité client.
  const { data: effectiveCoachClubId, isLoading: loadingCoachScope } = useQuery({
    queryKey: ["coach-effective-club-scope", "v1", user?.id, rawClubId],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase.rpc("get_coach_effective_club_id", {
        p_user_id: user.id,
        p_preferred_club_id: rawClubId || undefined,
      });
      if (error) throw error;
      return data || null;
    },
    enabled: isCoachRole && !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  const clubId = isCoachRole
    ? loadingCoachScope
      ? null
      : effectiveCoachClubId || rawClubId
    : rawClubId;
  const waitingForCoachScope = isCoachRole && loadingCoachScope;

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
        .eq("is_active", true)
        .is("deleted_at", null);
      if (error) throw error;
      return data || [];
    },
    enabled: teamIds.length > 0,
  });

  // Stats coach + globales en un seul appel backend rapide.
  // La fonction SECURITY DEFINER contourne la restriction RLS qui limite un coach
  // à ses équipes, tout en comptant uniquement les membres actifs/non archivés.
  const { data: dashboardStats, isLoading: loadingDashboardStats } = useQuery({
    queryKey: ["coach-my-club-dashboard-stats", "v4", user?.id, clubId, currentRole?.id],
    queryFn: async () => {
      if (!clubId || !user?.id) return null;
      const { data, error } = await supabase.rpc("get_coach_my_club_dashboard_stats", {
        p_user_id: user.id,
        p_club_id: clubId,
      });
      if (error) throw error;
      return (Array.isArray(data) ? data[0] : data) as unknown as CoachClubStats | null;
    },
    enabled: !!clubId && !!user?.id && !waitingForCoachScope,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch club framework (active template) + themes for printing
  const { data: clubFramework, isLoading: loadingFramework } = useQuery({
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

  const isStatsLoading = waitingForCoachScope || loadingDashboardStats;
  const coachFirstName = (profile as any)?.first_name?.trim?.() || "";
  const coachLastName = (profile as any)?.last_name?.trim?.() || "";
  const coachFullName = `${coachFirstName} ${coachLastName}`.trim() || user?.email?.split("@")[0] || "";

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

  // Ligne d'effectifs de l'encart club, au même format que la page du
  // responsable club (« Référent : … · 3 équipes · 4 coachs · … »).
  const clubFigures = isStatsLoading || !dashboardStats
    ? null
    : [
        plural(dashboardStats.total_teams, "équipe"),
        plural(dashboardStats.total_coaches, "coach"),
        plural(dashboardStats.total_players, "joueur"),
        plural(dashboardStats.total_supporters, "supporter"),
        plural(dashboardStats.total_users, "utilisateur"),
      ].join(" · ");

  return (
    <AppLayout>
      {/* 1-2. Titre et sous-titre — même police que « Mon club » du responsable club */}
      <div className="mb-6">
        <h1 className="text-3xl font-display font-bold text-foreground flex items-center gap-3">
          Bonjour {coachFullName}
          {currentRole?.role === "admin" && <Shield className="w-7 h-7 text-destructive" />}
          {currentRole?.role === "club_admin" && <Building2 className="w-7 h-7 text-primary" />}
          {isCoachRole && <UserCog className="w-7 h-7 text-orange-500" />}
        </h1>
        <p className="text-muted-foreground mt-1">
          Gérer vos équipes, vos joueurs et leurs supporters
        </p>
      </div>

      {/* 3. Encart du club */}
      <Card className="bg-card border border-border rounded-2xl p-5 mb-8 flex flex-wrap items-center gap-5">
        {club ? (
          <>
            <div
              className="relative rounded-2xl overflow-hidden flex-shrink-0 flex items-center justify-center"
              style={{
                width: "8.5rem",
                height: "8.5rem",
                backgroundColor: club.logo_url
                  ? "hsl(var(--secondary))"
                  : club.primary_color || "hsl(var(--secondary))",
              }}
            >
              {club.logo_url ? (
                <img
                  src={club.logo_url}
                  alt=""
                  aria-hidden="true"
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : (
                <span className="font-display text-5xl font-extrabold text-white">
                  {club.short_name || club.name.slice(0, 2).toUpperCase()}
                </span>
              )}
            </div>

            <div className="flex-1 min-w-[200px] flex flex-col justify-center">
              <h2 className="font-display text-[25px] leading-tight font-extrabold text-foreground tracking-tight truncate">
                {club.name}
              </h2>
              <p className="text-[14px] text-muted-foreground mt-1">
                {club.referent_name && <>Référent : {club.referent_name} · </>}
                {clubFigures ?? "Chargement des effectifs…"}
              </p>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-5 w-full">
            <Skeleton className="w-[8.5rem] h-[8.5rem] rounded-2xl" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-7 w-48" />
              <Skeleton className="h-4 w-80 max-w-full" />
            </div>
          </div>
        )}
      </Card>

      {/* 4. Mon tableau de bord — chiffres personnels du coach */}
      {isCoachRole && (
        <div className="mb-8">
          <h2 className="text-xl font-display font-semibold text-foreground mb-4">
            Mon tableau de bord
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatsCard
              title="Mes équipes"
              value={isStatsLoading ? "-" : String(dashboardStats?.my_teams ?? 0)}
              icon={Users}
              iconClassName="bg-primary/10 text-primary"
            />
            <StatsCard
              title="Mes joueurs"
              value={isStatsLoading ? "-" : String(dashboardStats?.my_players ?? 0)}
              icon={UserCircle}
              iconClassName="bg-green-500/10 text-green-500"
            />
            <StatsCard
              title="Mes supporters"
              value={isStatsLoading ? "-" : String(dashboardStats?.my_supporters ?? 0)}
              icon={Heart}
              iconClassName="bg-pink-500/10 text-pink-500"
            />
          </div>
        </div>
      )}

      {/* 5. Référentiel du club — lecture seule pour le coach */}
      {clubId && (
        <div className="mb-8">
          <h2 className="text-xl font-display font-semibold text-foreground mb-4">
            Référentiel du Club
          </h2>

          {loadingFramework ? (
            <Skeleton className="h-20 w-full rounded-xl" />
          ) : clubFramework ? (
            <Card
              className="border-primary/20 bg-primary/5 cursor-pointer transition-all hover:shadow-lg hover:border-primary/40"
              onClick={() => navigate(`/clubs/${clubId}/framework`)}
            >
              <CardHeader className="py-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <BookOpen className="w-5 h-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-base truncate">{clubFramework.name}</CardTitle>
                      <CardDescription className="truncate">
                        {plural(clubFramework.themes_count, "thématique")} • {plural(clubFramework.skills_count, "compétence")}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2 w-full sm:w-auto">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/clubs/${clubId}/framework`);
                      }}
                    >
                      <Eye className="w-4 h-4 mr-2 text-accent" />
                      Consulter
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePrint();
                      }}
                    >
                      <Printer className="w-4 h-4 mr-2 text-accent" />
                      Imprimer
                    </Button>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ) : (
            // Le cadre reste visible même sans référentiel : le coach sait ainsi
            // qu'il existe, et à qui s'adresser. Pas de bouton de création — c'est
            // une prérogative du responsable club.
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-8 text-center">
                <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center mb-4">
                  <BookOpen className="w-6 h-6 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium mb-1">Aucun référentiel</h3>
                <p className="text-sm text-muted-foreground">
                  Le responsable du club n'a pas encore configuré le référentiel de compétences.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* 6. Équipes du club */}
      <div>
        <h2 className="text-xl font-display font-semibold text-foreground mb-6">Équipes du club</h2>

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
                    {plural(team.playerCount, "joueur")}
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
