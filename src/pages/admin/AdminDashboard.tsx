import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { StatsCard } from "@/components/shared/StatsCard";
import {
  Building2, Users, Trophy, Plus, ChevronDown, ChevronRight,
  Target, BarChart3, Search, Calendar, User, Eye
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { CircleAvatar } from "@/components/shared/CircleAvatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

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

  const [overviewOpen, setOverviewOpen] = useState(true);
  const [clubsOpen, setClubsOpen] = useState(true);
  const [debriefsOpen, setDebriefsOpen] = useState(true);
  const [debriefsSearch, setDebriefsSearch] = useState("");
  const [debriefsTeamFilter, setDebriefsTeamFilter] = useState("all");

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) {
      navigate("/dashboard", { replace: true });
    }
  }, [user, loading, isAdmin, navigate]);

  // KPI: clubs
  const { data: clubsCount, isLoading: loadingClubs } = useQuery({
    queryKey: ["admin-stats-clubs"],
    queryFn: async () => {
      const { count } = await supabase.from("clubs").select("*", { count: "exact", head: true }).is("deleted_at", null);
      return count || 0;
    },
    enabled: !!user && isAdmin,
  });

  // KPI: teams
  const { data: teamsCount, isLoading: loadingTeams } = useQuery({
    queryKey: ["admin-stats-teams"],
    queryFn: async () => {
      const { count } = await supabase.from("teams").select("*", { count: "exact", head: true }).is("deleted_at", null);
      return count || 0;
    },
    enabled: !!user && isAdmin,
  });

  // KPI: players
  const { data: playersCount, isLoading: loadingPlayers } = useQuery({
    queryKey: ["admin-stats-players"],
    queryFn: async () => {
      const { count } = await supabase.from("user_roles").select("*", { count: "exact", head: true }).eq("role", "player");
      return count || 0;
    },
    enabled: !!user && isAdmin,
  });

  // KPI: evaluations count + average score
  const { data: evalStats, isLoading: loadingEvals } = useQuery({
    queryKey: ["admin-stats-evals"],
    queryFn: async () => {
      const { count } = await supabase.from("evaluations").select("*", { count: "exact", head: true }).is("deleted_at", null);
      const { data: scores } = await supabase.from("evaluation_scores").select("score").not("score", "is", null);
      const validScores = (scores || []).filter((s: any) => s.score !== null).map((s: any) => s.score as number);
      const avg = validScores.length > 0 ? (validScores.reduce((a: number, b: number) => a + b, 0) / validScores.length) : null;
      return { total: count || 0, avgScore: avg ? avg.toFixed(1) : "N/A" };
    },
    enabled: !!user && isAdmin,
  });

  // KPI: objectives
  const { data: objStats, isLoading: loadingObj } = useQuery({
    queryKey: ["admin-stats-objectives"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("team_objectives").select("status");
      const all = data || [];
      const total = all.length;
      const succeeded = all.filter((o: any) => o.status === "succeeded").length;
      const missed = all.filter((o: any) => o.status === "missed").length;
      const finalized = succeeded + missed;
      const pct = finalized > 0 ? Math.round((succeeded / finalized) * 100) : null;
      return { total, pct };
    },
    enabled: !!user && isAdmin,
  });

  // Clubs list
  const { data: clubs, isLoading: loadingClubsList } = useQuery({
    queryKey: ["admin-clubs-list"],
    queryFn: async () => {
      const { data: clubsData } = await supabase
        .from("clubs")
        .select("id, name, logo_url, primary_color, referent_name, referent_email")
        .is("deleted_at", null)
        .order("name");
      const clubsWithCounts = await Promise.all(
        (clubsData || []).map(async (club) => {
          const { count } = await supabase.from("teams").select("*", { count: "exact", head: true }).eq("club_id", club.id).is("deleted_at", null);
          return { ...club, teamsCount: count || 0 };
        })
      );
      return clubsWithCounts;
    },
    enabled: !!user && isAdmin,
  });

  // Debriefs list
  const { data: evaluations, isLoading: loadingEvalsList } = useQuery({
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
        .order("date", { ascending: false })
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

  // Filter debriefs
  const filteredEvals = (evaluations || []).filter((e: any) => {
    const playerName = e.player?.nickname || `${e.player?.first_name || ""} ${e.player?.last_name || ""}`;
    const matchSearch = playerName.toLowerCase().includes(debriefsSearch.toLowerCase()) ||
      e.name.toLowerCase().includes(debriefsSearch.toLowerCase());
    return matchSearch;
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
          <h1 className="text-3xl font-display font-bold text-foreground">
            Bonjour, {profile?.first_name || "Admin"} 👋
          </h1>
          <p className="text-muted-foreground mt-1">Vue d'ensemble de la plateforme</p>
        </div>

        {/* Section 1: Vue globale */}
        <div className="bg-card rounded-xl border border-border">
          <Collapsible open={overviewOpen} onOpenChange={setOverviewOpen}>
            <SectionHeader title="Vue globale" icon={Eye} isOpen={overviewOpen} onToggle={() => setOverviewOpen(!overviewOpen)} />
            <CollapsibleContent>
              <div className="px-4 md:px-5 pb-5 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                <StatsCard title="Clubs" value={loadingClubs ? "-" : String(clubsCount)} icon={Building2} />
                <StatsCard title="Équipes" value={loadingTeams ? "-" : String(teamsCount)} icon={Users} />
                <StatsCard title="Joueurs" value={loadingPlayers ? "-" : String(playersCount)} icon={User} />
                <StatsCard title="Débriefs" value={loadingEvals ? "-" : String(evalStats?.total)} icon={Trophy} />
                <StatsCard title="Score moyen" value={loadingEvals ? "-" : (evalStats?.avgScore || "N/A")} icon={BarChart3} />
                <StatsCard title="Objectifs" value={loadingObj ? "-" : String(objStats?.total)} icon={Target} />
                <StatsCard
                  title="Réussite obj."
                  value={loadingObj ? "-" : (objStats?.pct !== null ? `${objStats?.pct}%` : "N/A")}
                  icon={Target}
                  color={objStats?.pct !== null && objStats?.pct !== undefined && objStats.pct >= 50 ? "success" : "warning"}
                />
              </div>
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
                <Button size="sm" asChild>
                  <Link to="/clubs">
                    <Plus className="w-4 h-4 mr-1" />
                    Nouveau
                  </Link>
                </Button>
              }
            />
            <CollapsibleContent>
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
                      Array.from({ length: 3 }).map((_, i) => (
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
                        <TableRow key={club.id} className="hover:bg-muted/50 cursor-pointer" onClick={() => navigate(`/clubs/${club.id}`)}>
                          <TableCell>
                            <CircleAvatar name={club.name} imageUrl={club.logo_url} color={club.primary_color} size="sm" />
                          </TableCell>
                          <TableCell className="font-medium">{club.name}</TableCell>
                          <TableCell className="text-muted-foreground">{club.referent_name || "-"}</TableCell>
                          <TableCell className="text-muted-foreground">{club.referent_email || "-"}</TableCell>
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
            </CollapsibleContent>
          </Collapsible>
        </div>

        {/* Section 3: Débriefs */}
        <div className="bg-card rounded-xl border border-border">
          <Collapsible open={debriefsOpen} onOpenChange={setDebriefsOpen}>
            <SectionHeader title="Débriefs" icon={Trophy} isOpen={debriefsOpen} onToggle={() => setDebriefsOpen(!debriefsOpen)} />
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
                </div>
              </div>

              <div className="px-4 md:px-5 pb-5 space-y-2">
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
                        onClick={() => navigate(`/players/${evaluation.player?.id}`)}
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
    </AppLayout>
  );
};

export default AdminDashboard;
