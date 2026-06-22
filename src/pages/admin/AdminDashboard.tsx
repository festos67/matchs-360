/**
 * @page AdminDashboard
 * @route /admin/dashboard
 *
 * Tableau de bord du Super Admin — vue omnisciente de la plateforme.
 * (mem://features/admin/dashboard-layout)
 *
 * @description
 * Centralise le pilotage en trois sections repliables (Vue globale, Liste,
 * Pilotage). KPIs agrégés sur tous les clubs, équipes, joueurs et débriefs.
 *
 * @sections
 * - **Vue globale** : StatsCards (clubs, équipes, joueurs, débriefs du mois)
 * - **Liste** : table des derniers débriefs avec filtres croisés
 *   (mem://features/debrief-filtering-workflow)
 * - **Pilotage** : raccourcis vers les consoles de gestion
 *
 * @access Super Admin uniquement
 *
 * @maintenance
 * - Les sections sont collapsibles ; l'état est persisté en localStorage pour
 *   la prochaine visite
 * - Les KPIs excluent les évaluations consultatives (self/supporter)
 *   (mem://logic/assessment-data-isolation-rules)
 * - L'admin voit toutes les données sans restriction RLS
 *   (mem://logic/admin-visibility)
 */
import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { StatsCard } from "@/components/shared/StatsCard";
import {
  Building2, Users, Trophy, Plus, ChevronDown, ChevronRight,
  Target, BarChart3, Search, Calendar, User, Eye, TrendingUp, UsersRound, Shield
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { CircleAvatar } from "@/components/shared/CircleAvatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CreateEvaluationModal } from "@/components/modals/CreateEvaluationModal";
import { CreateClubModal } from "@/components/modals/CreateClubModal";

// Phase 1 conformite mineurs : bandeau de pilotage du backfill.
function BirthdateBackfillBanner({ count }: { count: number }) {
  const navigate = useNavigate();
  if (!count || count === 0) return null;
  return (
    <button
      onClick={() => navigate("/admin/birthdate-backfill")}
      className="w-full text-left flex items-center gap-3 p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 transition-colors"
    >
      <Shield className="w-5 h-5 text-amber-600 shrink-0" />
      <div className="flex-1">
        <p className="font-medium text-sm">
          RGPD mineurs — {count} profil{count > 1 ? "s" : ""} sans date de naissance
        </p>
        <p className="text-xs text-amber-800 dark:text-amber-200">
          La date de naissance est requise pour appliquer les protections mineurs (consentement, droit à l'image).
        </p>
      </div>
      <ChevronRight className="w-4 h-4 text-amber-700 dark:text-amber-300" />
    </button>
  );
}

const SectionHeader = ({
  title,
  icon: Icon,
  isOpen,
  onToggle,
  action,
}: {
  title: string;
  icon: React.ElementType;
  isOpen: boolean;
  onToggle: () => void;
  action?: React.ReactNode;
}) => (
  <div className="flex items-center justify-between p-4 md:p-5">
    <button onClick={onToggle} className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
      {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
      <Icon className="w-5 h-5 text-primary" />
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
    </button>
    {action}
  </div>
);

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { user, loading, hasAdminRole: isAdmin, profile } = useAuth();
  const queryClient = useQueryClient();

  const [overviewOpen, setOverviewOpen] = useState(false);
  const [clubsOpen, setClubsOpen] = useState(false);
  const [debriefsOpen, setDebriefsOpen] = useState(false);
  const [debriefsSearch, setDebriefsSearch] = useState("");
  const [clubsSearch, setClubsSearch] = useState("");
  const [debriefsTeamFilter, setDebriefsTeamFilter] = useState("all");
  const [debriefsCoachFilter, setDebriefsCoachFilter] = useState("all");
  const [createEvalOpen, setCreateEvalOpen] = useState(false);
  const [createClubOpen, setCreateClubOpen] = useState(false);

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) {
      navigate("/dashboard", { replace: true });
    }
  }, [user, loading, isAdmin, navigate]);

  // KPI: agrégat global en 1 RPC (clubs, teams, players, users, evaluations,
  // needing_birthdate, avg_score). Évite la rafale de 6 HEAD au chargement.
  const { data: stats, isLoading: loadingStats } = useQuery({
    queryKey: ["admin-dashboard-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_admin_dashboard_stats" as any);
      if (error) throw error;
      return data as {
        clubs: number;
        teams: number;
        players: number;
        users: number;
        evaluations: number;
        needing_birthdate: number;
        avg_score: number | null;
      };
    },
    enabled: !!user && isAdmin,
  });

  const clubsCount = stats?.clubs ?? 0;
  const teamsCount = stats?.teams ?? 0;
  const playersCount = stats?.players ?? 0;
  const usersCount = stats?.users ?? 0;
  const evalStats = stats
    ? {
        total: stats.evaluations,
        avgScore: stats.avg_score != null ? `${stats.avg_score.toFixed(1)} / 5` : "N/A",
        avgPerTeam: stats.teams > 0 ? (stats.evaluations / stats.teams).toFixed(1) : "N/A",
      }
    : undefined;
  const loadingClubs = loadingStats;
  const loadingTeams = loadingStats;
  const loadingPlayers = loadingStats;
  const loadingUsers = loadingStats;
  const loadingEvals = loadingStats;

  // KPI: avg progression
  const { data: avgProgression, isLoading: loadingProgression } = useQuery({
    queryKey: ["admin-stats-progression"],
    queryFn: async () => {
      const { data: players } = await supabase.from("user_roles").select("user_id").eq("role", "player");
      const playerIds = [...new Set((players || []).map((p) => p.user_id))];
      if (playerIds.length === 0) return null;
      const calcAvg = (scores: Array<{ score: number | null; is_not_observed: boolean }>) => {
        const valid = scores.filter((s) => !s.is_not_observed && s.score !== null && s.score > 0);
        if (valid.length === 0) return null;
        return valid.reduce((acc, s) => acc + (s.score || 0), 0) / valid.length;
      };
      const { data: evals } = await supabase
        .from("evaluations")
        .select("id, player_id, created_at")
        .in("player_id", playerIds)
        .eq("type", "coach")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (!evals || evals.length === 0) return null;
      const byPlayer = new Map<string, string[]>();
      for (const e of evals) {
        const arr = byPlayer.get(e.player_id) || [];
        if (arr.length < 2) { arr.push(e.id); byPlayer.set(e.player_id, arr); }
      }
      const neededEvalIds = [...byPlayer.values()].filter((a) => a.length === 2).flat();
      if (neededEvalIds.length === 0) return null;
      const { data: scoresRows } = await supabase
        .from("evaluation_scores")
        .select("evaluation_id, score, is_not_observed")
        .in("evaluation_id", neededEvalIds)
        .is("deleted_at", null);
      const scoresByEval = new Map<string, Array<{ score: number | null; is_not_observed: boolean }>>();
      (scoresRows || []).forEach((s: { evaluation_id: string; score: number | null; is_not_observed: boolean }) => {
        const arr = scoresByEval.get(s.evaluation_id) || [];
        arr.push({ score: s.score, is_not_observed: s.is_not_observed });
        scoresByEval.set(s.evaluation_id, arr);
      });
      const progressions: number[] = [];
      for (const arr of byPlayer.values()) {
        if (arr.length < 2) continue;
        const [latestId, previousId] = arr;
        const avgL = calcAvg(scoresByEval.get(latestId) || []);
        const avgP = calcAvg(scoresByEval.get(previousId) || []);
        if (avgL !== null && avgP !== null && avgP > 0) {
          progressions.push(((avgL - avgP) / avgP) * 100);
        }
      }
      if (progressions.length === 0) return null;
      return Math.round((progressions.reduce((a, b) => a + b, 0) / progressions.length) * 10) / 10;
    },
    enabled: !!user && isAdmin,
  });

  // KPI: objectives
  const { data: objStats, isLoading: loadingObj } = useQuery({
    queryKey: ["admin-stats-objectives"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("team_objectives").select("status, team_id");
      const all = data || [];
      const total = all.length;
      const succeeded = all.filter((o: any) => o.status === "succeeded").length;
      const missed = all.filter((o: any) => o.status === "missed").length;
      const finalized = succeeded + missed;
      const pct = finalized > 0 ? Math.round((succeeded / finalized) * 100) : null;
      const uniqueTeams = new Set(all.map((o: any) => o.team_id)).size;
      const avgPerTeam = uniqueTeams > 0 ? (total / uniqueTeams).toFixed(1) : "N/A";
      const pctMissed = finalized > 0 ? Math.round((missed / finalized) * 100) : null;
      return { total, pct, pctMissed, avgPerTeam };
    },
    enabled: !!user && isAdmin,
  });

  // Clubs list
  const { data: clubs, isLoading: loadingClubsList } = useQuery({
    queryKey: ["admin-clubs-list"],
    queryFn: async () => {
      const [{ data: clubsData }, { data: teamsData }] = await Promise.all([
        supabase
          .from("clubs")
          .select("id, name, logo_url, primary_color, referent_name, referent_email")
          .is("deleted_at", null)
          .order("name"),
        supabase.from("teams").select("club_id").is("deleted_at", null),
      ]);
      const countByClub = new Map<string, number>();
      (teamsData || []).forEach((t: any) => {
        if (!t.club_id) return;
        countByClub.set(t.club_id, (countByClub.get(t.club_id) || 0) + 1);
      });
      return (clubsData || []).map((club) => ({
        ...club,
        teamsCount: countByClub.get(club.id) || 0,
      }));
    },
    enabled: !!user && isAdmin,
  });

  // Debriefs list
  const { data: evaluations, isLoading: loadingEvalsList, refetch: refetchDebriefs } = useQuery({
    queryKey: ["admin-debriefs-list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("evaluations")
        .select(`
          id, name, date,
          player:profiles!evaluations_player_id_fkey(id, first_name, last_name, nickname),
          coach:profiles!evaluations_coach_id_fkey(first_name, last_name)
        `)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(50);
      return (data || []) as any[];
    },
    enabled: !!user && isAdmin,
  });

  // Teams for filter
  const { data: teams } = useQuery({
    queryKey: ["admin-teams-filter"],
    queryFn: async () => {
      const { data } = await supabase.from("teams").select("id, name").is("deleted_at", null).order("name");
      return data || [];
    },
    enabled: !!user && isAdmin,
  });

  // Unique coaches for filter
  const coachOptions = (() => {
    const map = new Map<string, string>();
    (evaluations || []).forEach((e: any) => {
      const name = `${e.coach?.first_name || ""} ${e.coach?.last_name || ""}`.trim();
      if (name) {
        const key = name.toLowerCase();
        if (!map.has(key)) map.set(key, name);
      }
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  })();

  // Filter debriefs
  const filteredEvals = (evaluations || []).filter((e: any) => {
    const playerName = e.player?.nickname || `${e.player?.first_name || ""} ${e.player?.last_name || ""}`;
    const coachName = `${e.coach?.first_name || ""} ${e.coach?.last_name || ""}`.trim().toLowerCase();
    const matchSearch = playerName.toLowerCase().includes(debriefsSearch.toLowerCase()) ||
      e.name.toLowerCase().includes(debriefsSearch.toLowerCase());
    const matchCoach = debriefsCoachFilter === "all" || coachName === debriefsCoachFilter;
    return matchSearch && matchCoach;
  });

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });

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
      <div className="space-y-4">
        {/* Header */}
        <div>
          <h1 className="font-display text-[26px] font-extrabold text-foreground tracking-tight flex items-center gap-3">
            Bonjour {profile?.first_name || "Admin"} 👋
            <Shield className="w-6 h-6 text-destructive" />
          </h1>
          <p className="text-[13px] text-muted-foreground mt-1">Accès complet à la plateforme</p>
        </div>

        <BirthdateBackfillBanner count={stats?.needing_birthdate ?? 0} />

        {/* Section 1: Vue globale */}
        <div className="bg-card rounded-xl border border-border">
          <Collapsible open={overviewOpen} onOpenChange={setOverviewOpen}>
            <SectionHeader title="Vue globale" icon={Eye} isOpen={overviewOpen} onToggle={() => setOverviewOpen(!overviewOpen)} />
             <CollapsibleContent>
              <TooltipProvider delayDuration={200}>
                <div className="px-4 md:px-5 pb-4 space-y-1.5">
                  {/* Sous-titre Effectif */}
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium pl-1">Effectif</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <Tooltip><TooltipTrigger asChild>
                      <div><StatsCard title="Nombre de clubs" value={loadingClubs ? "-" : String(clubsCount)} icon={Building2} /></div>
                    </TooltipTrigger><TooltipContent>Nombre total de clubs actifs sur la plateforme</TooltipContent></Tooltip>
                    <Tooltip><TooltipTrigger asChild>
                      <div><StatsCard title="Nombre d'équipes" value={loadingTeams ? "-" : String(teamsCount)} icon={Users} /></div>
                    </TooltipTrigger><TooltipContent>Nombre total d'équipes actives</TooltipContent></Tooltip>
                    <Tooltip><TooltipTrigger asChild>
                      <div><StatsCard title="Nombre de joueurs" value={loadingPlayers ? "-" : String(playersCount)} icon={User} /></div>
                    </TooltipTrigger><TooltipContent>Nombre total de joueurs inscrits</TooltipContent></Tooltip>
                    <Tooltip><TooltipTrigger asChild>
                      <div><StatsCard title="Nombre d'utilisateurs" value={loadingUsers ? "-" : String(usersCount)} icon={UsersRound} /></div>
                    </TooltipTrigger><TooltipContent>Nombre total d'utilisateurs sur la plateforme</TooltipContent></Tooltip>
                  </div>

                  {/* Sous-titre Débriefs */}
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium pl-1 pt-1">Débriefs</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <Tooltip><TooltipTrigger asChild>
                      <div><StatsCard title="Nombre de débriefs" value={loadingEvals ? "-" : String(evalStats?.total)} icon={Trophy} /></div>
                    </TooltipTrigger><TooltipContent>Nombre total de débriefs réalisés</TooltipContent></Tooltip>
                    <Tooltip><TooltipTrigger asChild>
                      <div><StatsCard title="Nb moy. débrief / équipe" value={loadingEvals ? "-" : (evalStats?.avgPerTeam || "N/A")} icon={Trophy} /></div>
                    </TooltipTrigger><TooltipContent>Nombre moyen de débriefs par équipe</TooltipContent></Tooltip>
                    <Tooltip><TooltipTrigger asChild>
                      <div><StatsCard title="Score moyen" value={loadingEvals ? "-" : (evalStats?.avgScore || "N/A")} icon={BarChart3} /></div>
                    </TooltipTrigger><TooltipContent>Score moyen de l'ensemble des évaluations (sur 5)</TooltipContent></Tooltip>
                    <Tooltip><TooltipTrigger asChild>
                      <div><StatsCard
                        title="Progression moy."
                        value={loadingProgression ? "-" : (avgProgression !== null ? `${avgProgression > 0 ? "+" : ""}${avgProgression}%` : "N/A")}
                        icon={TrendingUp}
                      /></div>
                    </TooltipTrigger><TooltipContent>Pourcentage moyen de progression des joueurs entre leurs deux derniers débriefs</TooltipContent></Tooltip>
                  </div>

                  {/* Sous-titre Objectifs */}
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium pl-1 pt-1">Objectifs</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <Tooltip><TooltipTrigger asChild>
                      <div><StatsCard title="Nombre d'objectifs" value={loadingObj ? "-" : String(objStats?.total)} icon={Target} /></div>
                    </TooltipTrigger><TooltipContent>Nombre total d'objectifs créés</TooltipContent></Tooltip>
                    <Tooltip><TooltipTrigger asChild>
                      <div><StatsCard title="Nb moy. obj. / équipe" value={loadingObj ? "-" : (objStats?.avgPerTeam || "N/A")} icon={Target} /></div>
                    </TooltipTrigger><TooltipContent>Nombre moyen d'objectifs par équipe</TooltipContent></Tooltip>
                    <Tooltip><TooltipTrigger asChild>
                      <div><StatsCard
                        title="% objectif réussi"
                        value={loadingObj ? "-" : (objStats?.pct !== null ? `${objStats?.pct}%` : "N/A")}
                        icon={Target}
                      /></div>
                    </TooltipTrigger><TooltipContent>Pourcentage d'objectifs réussis parmi ceux finalisés</TooltipContent></Tooltip>
                    <Tooltip><TooltipTrigger asChild>
                      <div><StatsCard
                        title="% objectif manqué"
                        value={loadingObj ? "-" : (objStats?.pctMissed !== null ? `${objStats?.pctMissed}%` : "N/A")}
                        icon={Target}
                      /></div>
                    </TooltipTrigger><TooltipContent>Pourcentage d'objectifs manqués parmi ceux finalisés</TooltipContent></Tooltip>
                  </div>
                </div>
              </TooltipProvider>
            </CollapsibleContent>
          </Collapsible>
        </div>

        {/* Section 2: Liste des clubs */}
        <div className="bg-card rounded-xl border border-border">
          <Collapsible open={clubsOpen} onOpenChange={setClubsOpen}>
            <SectionHeader
              title="Liste des clubs"
              icon={Building2}
              isOpen={clubsOpen}
              onToggle={() => setClubsOpen(!clubsOpen)}
              action={
                <Button size="sm" className="min-w-[160px]" onClick={() => setCreateClubOpen(true)}>
                  <Plus className="w-4 h-4 mr-1" />
                  Nouveau club
                </Button>
              }
            />
            <CollapsibleContent>
              <div className="px-4 md:px-5 pb-2 flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Rechercher un club..."
                    value={clubsSearch}
                    onChange={(e) => setClubsSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={clubsSearch ? "__search__" : "all"} onValueChange={(val) => { setClubsSearch(val === "all" ? "" : val === "__search__" ? clubsSearch : val); }}>
                  <SelectTrigger className="w-full sm:w-[220px]">
                    <SelectValue placeholder="Tous les clubs" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les clubs</SelectItem>
                    {(clubs || []).map((c) => (
                      <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
                <Table className="[&_td]:py-1.5 [&_th]:py-1.5">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40px]">Logo</TableHead>
                      <TableHead>Nom du Club</TableHead>
                      <TableHead>Référent</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead className="text-center">Équipes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingClubsList ? (
                      Array.from({ length: 3 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell><Skeleton className="w-7 h-7 rounded-full" /></TableCell>
                          <TableCell><Skeleton className="h-3.5 w-32" /></TableCell>
                          <TableCell><Skeleton className="h-3.5 w-24" /></TableCell>
                          <TableCell><Skeleton className="h-3.5 w-40" /></TableCell>
                          <TableCell><Skeleton className="h-3.5 w-8 mx-auto" /></TableCell>
                        </TableRow>
                      ))
                    ) : clubs && clubs.length > 0 ? (
                      clubs.filter((club) => club.name.toLowerCase().includes(clubsSearch.toLowerCase()) || (club.referent_name || "").toLowerCase().includes(clubsSearch.toLowerCase())).map((club) => (
                        <TableRow key={club.id} className="hover:bg-muted/50 cursor-pointer" onClick={() => navigate(`/clubs/${club.id}`)}>
                          <TableCell>
                            <CircleAvatar shape="square" name={club.name} imageUrl={club.logo_url} color={club.primary_color} size="sm" />
                          </TableCell>
                          <TableCell className="font-medium text-sm">{club.name}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">{club.referent_name || "-"}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">{club.referent_email || "-"}</TableCell>
                          <TableCell className="text-center">
                            <span className="inline-flex items-center justify-center min-w-[1.5rem] px-1.5 py-0.5 text-xs font-medium bg-primary/10 text-primary rounded-full">
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
            </CollapsibleContent>
          </Collapsible>
        </div>

        {/* Section 3: Débriefs */}
        <div className="bg-card rounded-xl border border-border">
          <Collapsible open={debriefsOpen} onOpenChange={setDebriefsOpen}>
            <SectionHeader
              title="Débriefs"
              icon={Trophy}
              isOpen={debriefsOpen}
              onToggle={() => setDebriefsOpen(!debriefsOpen)}
              action={
                <Button size="sm" className="min-w-[160px]" onClick={() => setCreateEvalOpen(true)}>
                  <Plus className="w-4 h-4 mr-1" />
                  Nouveau débrief
                </Button>
              }
            />
            <CollapsibleContent>
              <div className="px-4 md:px-5 pb-2">
                <div className="flex flex-col sm:flex-row gap-3 mb-4">
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Rechercher par joueur ou débrief..."
                      value={debriefsSearch}
                      onChange={(e) => setDebriefsSearch(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                   <Select value={debriefsTeamFilter} onValueChange={setDebriefsTeamFilter}>
                    <SelectTrigger className="w-full sm:w-[220px]">
                      <SelectValue placeholder="Toutes les équipes" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Toutes les équipes</SelectItem>
                      {(teams || []).map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={debriefsCoachFilter} onValueChange={setDebriefsCoachFilter}>
                    <SelectTrigger className="w-full sm:w-[220px]">
                      <SelectValue placeholder="Tous les coachs" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous les coachs</SelectItem>
                      {coachOptions.map(([key, name]) => (
                        <SelectItem key={key} value={key}>{name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="px-4 md:px-5 pb-5 space-y-2 max-h-[400px] overflow-y-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
                {loadingEvalsList ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4 p-3 rounded-lg bg-muted/30">
                      <Skeleton className="w-10 h-10 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-48" />
                      </div>
                    </div>
                  ))
                ) : filteredEvals.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Trophy className="w-10 h-10 mx-auto mb-2 opacity-40" />
                    <p>{debriefsSearch ? "Aucun résultat" : "Aucun débrief"}</p>
                  </div>
                ) : (
                  filteredEvals.map((evaluation: any) => {
                    const playerName = evaluation.player?.nickname ||
                      `${evaluation.player?.first_name || ""} ${evaluation.player?.last_name || ""}`.trim();
                    const coachName = `${evaluation.coach?.first_name || ""} ${evaluation.coach?.last_name || ""}`.trim();
                    return (
                      <div
                        key={evaluation.id}
                        className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer group"
                        onClick={() => evaluation.player?.id && navigate(`/players/${evaluation.player.id}?evaluation=${evaluation.id}`)}
                      >
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <User className="w-5 h-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{playerName || "Joueur"}</p>
                          <p className="text-xs text-muted-foreground truncate">{evaluation.name}</p>
                        </div>
                        <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Calendar className="w-3.5 h-3.5" />
                          {formatDate(evaluation.date)}
                        </div>
                        <div className="hidden md:block text-xs text-muted-foreground">
                          par {coachName || "Coach"}
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                    );
                  })
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>
      <CreateEvaluationModal
        open={createEvalOpen}
        onOpenChange={setCreateEvalOpen}
        onSuccess={() => refetchDebriefs()}
      />
      <CreateClubModal
        open={createClubOpen}
        onOpenChange={setCreateClubOpen}
        onSuccess={() => {
          setCreateClubOpen(false);
          queryClient.invalidateQueries({ queryKey: ["admin-clubs-list"] });
          queryClient.invalidateQueries({ queryKey: ["admin-stats-clubs"] });
        }}
      />
    </AppLayout>
  );
};

export default AdminDashboard;
