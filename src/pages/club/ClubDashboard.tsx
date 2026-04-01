import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { StatsCard } from "@/components/shared/StatsCard";
import {
  Users, Trophy, UserCog, Eye, Plus, Building2, User, Search,
  ChevronDown, ChevronRight, Target, BarChart3, TrendingUp, Shield,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { CircleAvatar } from "@/components/shared/CircleAvatar";

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

const ClubDashboard = () => {
  const navigate = useNavigate();
  const { user, loading, currentRole, profile } = useAuth();

  const [overviewOpen, setOverviewOpen] = useState(false);
  const [teamsOpen, setTeamsOpen] = useState(false);
  const [coachesOpen, setCoachesOpen] = useState(false);
  const [teamsSearch, setTeamsSearch] = useState("");
  const [coachesSearch, setCoachesSearch] = useState("");

  const clubId = currentRole?.club_id;

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

  // Helper: get team IDs for this club
  const { data: clubTeamIds } = useQuery({
    queryKey: ["club-team-ids", clubId],
    queryFn: async () => {
      if (!clubId) return [];
      const { data } = await supabase
        .from("teams")
        .select("id")
        .eq("club_id", clubId)
        .is("deleted_at", null);
      return (data || []).map((t) => t.id);
    },
    enabled: !!clubId,
  });

  // KPI: teams count
  const teamsCount = clubTeamIds?.length || 0;

  // KPI: coaches count
  const { data: coachesCount, isLoading: loadingCoaches } = useQuery({
    queryKey: ["club-stats-coaches", clubId, clubTeamIds],
    queryFn: async () => {
      if (!clubTeamIds || clubTeamIds.length === 0) return 0;
      const { count } = await supabase
        .from("team_members")
        .select("*", { count: "exact", head: true })
        .in("team_id", clubTeamIds)
        .eq("member_type", "coach")
        .eq("is_active", true);
      return count || 0;
    },
    enabled: !!clubTeamIds && clubTeamIds.length > 0,
  });

  // KPI: players count
  const { data: playersCount, isLoading: loadingPlayers } = useQuery({
    queryKey: ["club-stats-players", clubId, clubTeamIds],
    queryFn: async () => {
      if (!clubTeamIds || clubTeamIds.length === 0) return 0;
      const { count } = await supabase
        .from("team_members")
        .select("*", { count: "exact", head: true })
        .in("team_id", clubTeamIds)
        .eq("member_type", "player")
        .eq("is_active", true);
      return count || 0;
    },
    enabled: !!clubTeamIds && clubTeamIds.length > 0,
  });

  // KPI: evaluations stats (scoped to club players)
  const { data: evalStats, isLoading: loadingEvals } = useQuery({
    queryKey: ["club-stats-evals", clubId, clubTeamIds],
    queryFn: async () => {
      if (!clubTeamIds || clubTeamIds.length === 0) return { total: 0, avgScore: "N/A", avgPerTeam: "N/A" };
      // Get player IDs in club
      const { data: members } = await supabase
        .from("team_members")
        .select("user_id")
        .in("team_id", clubTeamIds)
        .eq("member_type", "player")
        .eq("is_active", true);
      const playerIds = [...new Set((members || []).map((m) => m.user_id))];
      if (playerIds.length === 0) return { total: 0, avgScore: "N/A", avgPerTeam: "N/A" };

      const { data: evals } = await supabase
        .from("evaluations")
        .select("id")
        .in("player_id", playerIds)
        .is("deleted_at", null);
      const evalIds = (evals || []).map((e) => e.id);
      const total = evalIds.length;

      let avgScore = "N/A";
      if (evalIds.length > 0) {
        const { data: scores } = await supabase
          .from("evaluation_scores")
          .select("score")
          .in("evaluation_id", evalIds)
          .not("score", "is", null);
        const valid = (scores || []).filter((s: any) => s.score !== null).map((s: any) => s.score as number);
        if (valid.length > 0) {
          avgScore = (valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(1) + " / 5";
        }
      }

      const avgPerTeam = clubTeamIds.length > 0 ? (total / clubTeamIds.length).toFixed(1) : "N/A";
      return { total, avgScore, avgPerTeam };
    },
    enabled: !!clubTeamIds && clubTeamIds.length > 0,
  });

  // KPI: avg progression (scoped to club)
  const { data: avgProgression, isLoading: loadingProgression } = useQuery({
    queryKey: ["club-stats-progression", clubId, clubTeamIds],
    queryFn: async () => {
      if (!clubTeamIds || clubTeamIds.length === 0) return null;
      const { data: members } = await supabase
        .from("team_members")
        .select("user_id")
        .in("team_id", clubTeamIds)
        .eq("member_type", "player")
        .eq("is_active", true);
      const playerIds = [...new Set((members || []).map((m) => m.user_id))];
      if (playerIds.length === 0) return null;

      const progressions: number[] = [];
      const calcAvg = (scores: Array<{ score: number | null; is_not_observed: boolean }>) => {
        const valid = scores.filter((s) => !s.is_not_observed && s.score !== null && s.score > 0);
        if (valid.length === 0) return null;
        return valid.reduce((acc, s) => acc + (s.score || 0), 0) / valid.length;
      };

      await Promise.all(
        playerIds.slice(0, 100).map(async (pid) => {
          const { data: evals } = await supabase
            .from("evaluations")
            .select("id, date")
            .eq("player_id", pid)
            .eq("type", "coach_assessment")
            .is("deleted_at", null)
            .order("date", { ascending: false })
            .limit(2);
          if (!evals || evals.length < 2) return;
          const [latest, previous] = evals;
          const [ls, ps] = await Promise.all([
            supabase.from("evaluation_scores").select("score, is_not_observed").eq("evaluation_id", latest.id),
            supabase.from("evaluation_scores").select("score, is_not_observed").eq("evaluation_id", previous.id),
          ]);
          const avgL = calcAvg(ls.data || []);
          const avgP = calcAvg(ps.data || []);
          if (avgL !== null && avgP !== null && avgP > 0) {
            progressions.push(((avgL - avgP) / avgP) * 100);
          }
        })
      );
      if (progressions.length === 0) return null;
      return Math.round((progressions.reduce((a, b) => a + b, 0) / progressions.length) * 10) / 10;
    },
    enabled: !!clubTeamIds && clubTeamIds.length > 0,
  });

  // KPI: objectives (scoped to club teams)
  const { data: objStats, isLoading: loadingObj } = useQuery({
    queryKey: ["club-stats-objectives", clubId, clubTeamIds],
    queryFn: async () => {
      if (!clubTeamIds || clubTeamIds.length === 0) return { total: 0, pct: null, pctMissed: null, avgPerTeam: "N/A" };
      const { data } = await supabase
        .from("team_objectives")
        .select("status, team_id")
        .in("team_id", clubTeamIds);
      const all = data || [];
      const total = all.length;
      const succeeded = all.filter((o: any) => o.status === "succeeded").length;
      const missed = all.filter((o: any) => o.status === "missed").length;
      const finalized = succeeded + missed;
      const pct = finalized > 0 ? Math.round((succeeded / finalized) * 100) : null;
      const pctMissed = finalized > 0 ? Math.round((missed / finalized) * 100) : null;
      const uniqueTeams = new Set(all.map((o: any) => o.team_id)).size;
      const avgPerTeam = uniqueTeams > 0 ? (total / uniqueTeams).toFixed(1) : "N/A";
      return { total, pct, pctMissed, avgPerTeam };
    },
    enabled: !!clubTeamIds && clubTeamIds.length > 0,
  });

  // Fetch teams list with counts
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
            coachesCount: coachesCount || 0,
          };
        })
      );

      return teamsWithCounts;
    },
    enabled: !!clubId,
  });

  // Fetch coaches list with team assignments
  const { data: coachesList, isLoading: loadingCoachesList } = useQuery({
    queryKey: ["club-coaches-list", clubId, clubTeamIds],
    queryFn: async () => {
      if (!clubTeamIds || clubTeamIds.length === 0) return [];

      // Get coach team_members for this club's teams
      const { data: coachMembers } = await supabase
        .from("team_members")
        .select("user_id, team_id, coach_role")
        .in("team_id", clubTeamIds)
        .eq("member_type", "coach")
        .eq("is_active", true);

      if (!coachMembers || coachMembers.length === 0) return [];

      const uniqueCoachIds = [...new Set(coachMembers.map((m) => m.user_id))];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, photo_url, email")
        .in("id", uniqueCoachIds)
        .is("deleted_at", null);

      // Get team names
      const { data: teamsData } = await supabase
        .from("teams")
        .select("id, name")
        .in("id", clubTeamIds);

      const teamNameMap: Record<string, string> = {};
      (teamsData || []).forEach((t) => { teamNameMap[t.id] = t.name; });

      return (profiles || []).map((p) => {
        const assignments = coachMembers
          .filter((m) => m.user_id === p.id)
          .map((m) => ({
            team_id: m.team_id,
            team_name: teamNameMap[m.team_id] || "Équipe",
            coach_role: m.coach_role as "referent" | "assistant" | null,
          }));

        return {
          id: p.id,
          first_name: p.first_name,
          last_name: p.last_name,
          photo_url: p.photo_url,
          email: p.email,
          assignments,
        };
      }).sort((a, b) => {
        const nameA = `${a.first_name || ""} ${a.last_name || ""}`.toLowerCase();
        const nameB = `${b.first_name || ""} ${b.last_name || ""}`.toLowerCase();
        return nameA.localeCompare(nameB);
      });
    },
    enabled: !!clubTeamIds && clubTeamIds.length > 0,
  });

  const filteredCoaches = (coachesList || []).filter((coach) => {
    if (!coachesSearch.trim()) return true;
    const q = coachesSearch.toLowerCase();
    const name = `${coach.first_name || ""} ${coach.last_name || ""}`.toLowerCase();
    return name.includes(q) || coach.email.toLowerCase().includes(q);
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
      <div className="space-y-4">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground flex items-center gap-3">
            Bonjour {profile?.first_name || "Administrateur"}
            <Building2 className="w-7 h-7 text-primary" />
          </h1>
          <p className="text-muted-foreground mt-1">
            Gérer mon club et ses équipes
          </p>
        </div>

        {/* Section 1: Vue globale de mon club */}
        <div className="bg-card rounded-xl border border-border">
          <Collapsible open={overviewOpen} onOpenChange={setOverviewOpen}>
            <SectionHeader
              title="Vue globale de mon club"
              icon={Eye}
              isOpen={overviewOpen}
              onToggle={() => setOverviewOpen(!overviewOpen)}
            />
            <CollapsibleContent>
              <TooltipProvider delayDuration={200}>
                <div className="px-4 md:px-5 pb-4 space-y-1.5">
                  {/* Effectif */}
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium pl-1">Effectif</p>
                  <div className="grid grid-cols-3 gap-2">
                    <Tooltip><TooltipTrigger asChild>
                      <div><StatsCard title="Coachs" value={loadingCoaches ? "-" : String(coachesCount || 0)} icon={UserCog} /></div>
                    </TooltipTrigger><TooltipContent>Nombre total de coachs actifs dans le club</TooltipContent></Tooltip>
                    <Tooltip><TooltipTrigger asChild>
                      <div><StatsCard title="Équipes" value={String(teamsCount)} icon={Users} /></div>
                    </TooltipTrigger><TooltipContent>Nombre total d'équipes actives dans le club</TooltipContent></Tooltip>
                    <Tooltip><TooltipTrigger asChild>
                      <div><StatsCard title="Joueurs" value={loadingPlayers ? "-" : String(playersCount || 0)} icon={User} /></div>
                    </TooltipTrigger><TooltipContent>Nombre total de joueurs actifs dans le club</TooltipContent></Tooltip>
                  </div>

                  {/* Débriefs */}
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium pl-1 pt-1">Débriefs</p>
                  <div className="grid grid-cols-4 gap-2">
                    <Tooltip><TooltipTrigger asChild>
                      <div><StatsCard title="Nombre de débriefs" value={loadingEvals ? "-" : String(evalStats?.total || 0)} icon={Trophy} /></div>
                    </TooltipTrigger><TooltipContent>Nombre total de débriefs réalisés dans le club</TooltipContent></Tooltip>
                    <Tooltip><TooltipTrigger asChild>
                      <div><StatsCard title="Nb moy. débrief / équipe" value={loadingEvals ? "-" : (evalStats?.avgPerTeam || "N/A")} icon={Trophy} /></div>
                    </TooltipTrigger><TooltipContent>Nombre moyen de débriefs par équipe</TooltipContent></Tooltip>
                    <Tooltip><TooltipTrigger asChild>
                      <div><StatsCard title="Score moyen" value={loadingEvals ? "-" : (evalStats?.avgScore || "N/A")} icon={BarChart3} /></div>
                    </TooltipTrigger><TooltipContent>Score moyen des évaluations du club (sur 5)</TooltipContent></Tooltip>
                    <Tooltip><TooltipTrigger asChild>
                      <div><StatsCard
                        title="Progression moy."
                        value={loadingProgression ? "-" : (avgProgression !== null ? `${avgProgression > 0 ? "+" : ""}${avgProgression}%` : "N/A")}
                        icon={TrendingUp}
                      /></div>
                    </TooltipTrigger><TooltipContent>Progression moyenne des joueurs entre leurs deux derniers débriefs</TooltipContent></Tooltip>
                  </div>

                  {/* Objectifs */}
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium pl-1 pt-1">Objectifs</p>
                  <div className="grid grid-cols-4 gap-2">
                    <Tooltip><TooltipTrigger asChild>
                      <div><StatsCard title="Nombre d'objectifs" value={loadingObj ? "-" : String(objStats?.total || 0)} icon={Target} /></div>
                    </TooltipTrigger><TooltipContent>Nombre total d'objectifs créés dans le club</TooltipContent></Tooltip>
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

        {/* Section 2: Liste des équipes */}
        <div className="bg-card rounded-xl border border-border">
          <Collapsible open={teamsOpen} onOpenChange={setTeamsOpen}>
            <SectionHeader
              title="Liste des équipes"
              icon={Users}
              isOpen={teamsOpen}
              onToggle={() => setTeamsOpen(!teamsOpen)}
              action={
                <Button size="sm" className="min-w-[160px]" asChild>
                  <Link to={clubId ? `/clubs/${clubId}` : "/clubs"}>
                    <Plus className="w-4 h-4 mr-1" />
                    Nouvelle équipe
                  </Link>
                </Button>
              }
            />
            <CollapsibleContent>
              <div className="px-4 md:px-5 pb-2">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Rechercher une équipe..."
                    value={teamsSearch}
                    onChange={(e) => setTeamsSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
                <Table className="[&_td]:py-1.5 [&_th]:py-1.5">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40px]"></TableHead>
                      <TableHead>Équipe</TableHead>
                      <TableHead>Saison</TableHead>
                      <TableHead className="text-center">Joueurs</TableHead>
                      <TableHead className="text-center">Coachs</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingTeamsList ? (
                      Array.from({ length: 3 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell><Skeleton className="w-7 h-7 rounded-full" /></TableCell>
                          <TableCell><Skeleton className="h-3.5 w-32" /></TableCell>
                          <TableCell><Skeleton className="h-3.5 w-20" /></TableCell>
                          <TableCell><Skeleton className="h-3.5 w-8 mx-auto" /></TableCell>
                          <TableCell><Skeleton className="h-3.5 w-8 mx-auto" /></TableCell>
                        </TableRow>
                      ))
                    ) : teams && teams.length > 0 ? (
                      teams
                        .filter((team) => team.name.toLowerCase().includes(teamsSearch.toLowerCase()))
                        .map((team) => (
                          <TableRow key={team.id} className="hover:bg-muted/50 cursor-pointer" onClick={() => navigate(`/teams/${team.id}`)}>
                            <TableCell>
                              <CircleAvatar name={team.name} color={team.color || "#3B82F6"} size="sm" />
                            </TableCell>
                            <TableCell className="font-medium text-sm">{team.name}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">{team.season || "-"}</TableCell>
                            <TableCell className="text-center">
                              <span className="inline-flex items-center justify-center min-w-[1.5rem] px-1.5 py-0.5 text-xs font-medium bg-primary/10 text-primary rounded-full">
                                {team.playersCount}
                              </span>
                            </TableCell>
                            <TableCell className="text-center">
                              <span className="inline-flex items-center justify-center min-w-[1.5rem] px-1.5 py-0.5 text-xs font-medium bg-secondary/50 text-secondary-foreground rounded-full">
                                {team.coachesCount}
                              </span>
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
            </CollapsibleContent>
          </Collapsible>
        </div>

        {/* Section 3: Mes Coachs */}
        <div className="bg-card rounded-xl border border-border">
          <Collapsible open={coachesOpen} onOpenChange={setCoachesOpen}>
            <SectionHeader
              title="Mes Coachs"
              icon={UserCog}
              isOpen={coachesOpen}
              onToggle={() => setCoachesOpen(!coachesOpen)}
            />
            <CollapsibleContent>
              <div className="px-4 md:px-5 pb-2">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Rechercher un coach..."
                    value={coachesSearch}
                    onChange={(e) => setCoachesSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <div className="px-4 md:px-5 pb-5">
                {loadingCoachesList ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="flex flex-col items-center gap-2">
                        <Skeleton className="w-20 h-20 rounded-full" />
                        <Skeleton className="h-3 w-24" />
                        <Skeleton className="h-3 w-16" />
                      </div>
                    ))}
                  </div>
                ) : filteredCoaches.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <UserCog className="w-10 h-10 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">Aucun coach trouvé</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                    {filteredCoaches.map((coach) => (
                      <div
                        key={coach.id}
                        className="flex flex-col items-center text-center group cursor-pointer"
                        onClick={() => navigate(`/coaches`)}
                      >
                        {/* Avatar */}
                        <div className="relative mb-2">
                          {coach.photo_url ? (
                            <div className="w-20 h-20 rounded-full overflow-hidden ring-2 ring-border group-hover:ring-primary transition-colors">
                              <img
                                src={coach.photo_url}
                                alt={`${coach.first_name || ""} ${coach.last_name || ""}`}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          ) : (
                            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center ring-2 ring-border group-hover:ring-primary transition-colors">
                              <span className="text-xl font-bold text-primary">
                                {(coach.first_name?.charAt(0) || "").toUpperCase()}
                                {(coach.last_name?.charAt(0) || "").toUpperCase() || "?"}
                              </span>
                            </div>
                          )}
                          {/* Referent indicator */}
                          {coach.assignments.some((a) => a.coach_role === "referent") && (
                            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                              <Shield className="w-3.5 h-3.5 text-primary-foreground" />
                            </div>
                          )}
                        </div>

                        {/* Name */}
                        <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                          {coach.first_name || ""} {coach.last_name || ""}
                        </p>

                        {/* Team assignments */}
                        <div className="flex flex-wrap justify-center gap-1 mt-1.5">
                          {coach.assignments.length === 0 ? (
                            <span className="text-[11px] text-muted-foreground">Aucune équipe</span>
                          ) : (
                            coach.assignments.map((a) => (
                              <Badge
                                key={a.team_id}
                                variant={a.coach_role === "referent" ? "default" : "secondary"}
                                className={`text-[10px] px-1.5 py-0 ${
                                  a.coach_role === "referent"
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-muted text-muted-foreground"
                                }`}
                              >
                                {a.team_name}
                                <span className="ml-0.5 opacity-70">
                                  {a.coach_role === "referent" ? "• Réf" : "• Ass"}
                                </span>
                              </Badge>
                            ))
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>
    </AppLayout>
  );
};

export default ClubDashboard;
