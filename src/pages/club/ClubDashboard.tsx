import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { StatsCard } from "@/components/shared/StatsCard";
import {
  Users, Trophy, UserCheck, Eye, Plus, Building2, User,
  ChevronDown, ChevronRight, Target, BarChart3, TrendingUp,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";

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
                      <div><StatsCard title="Coachs" value={loadingCoaches ? "-" : String(coachesCount || 0)} icon={UserCheck} /></div>
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
