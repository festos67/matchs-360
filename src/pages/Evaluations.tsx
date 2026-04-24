/**
 * @page Evaluations
 * @route /evaluations
 *
 * Liste centralisée des débriefs (évaluations) avec filtres croisés.
 *
 * @description
 * Vue chronologique de tous les débriefs accessibles à l'utilisateur. Permet de
 * naviguer rapidement vers une fiche joueur ou de créer un nouveau débrief.
 *
 * @filters (mem://features/debrief-filtering-workflow)
 * - Recherche par nom de joueur
 * - Filtre par équipe
 * - Filtre par coach (auteur)
 * - Pour les coachs : menu "Mes Débriefs" filtre auto sur evaluator_id
 *   (mem://features/coach/personal-evaluations-view)
 *
 * @access
 * - Admin / Club Admin : voient tous les débriefs de leur scope
 * - Coach : uniquement ses équipes assignées
 * - Joueur : ses propres débriefs (officiels + auto-débriefs)
 * - Supporter : ses débriefs créés sur invitation
 *
 * @maintenance
 * Auto-débriefs (`self`) et débriefs supporters n'apparaissent pas dans les
 * stats officielles (mem://logic/assessment-data-isolation-rules).
 */
import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Trophy, Search, Calendar, User, ChevronRight, Plus, X, ArrowLeft, ExternalLink } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { CreateEvaluationModal } from "@/components/modals/CreateEvaluationModal";
import { useClubAdminScope } from "@/hooks/useClubAdminScope";

interface Evaluation {
  id: string;
  name: string;
  date: string;
  player: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    nickname: string | null;
  };
  coach: {
    first_name: string | null;
    last_name: string | null;
  };
}

export default function Evaluations() {
  const { user, loading: authLoading, roles } = useAuth();
  const { isSuperAdmin, myAdminClubIds } = useClubAdminScope();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [coachFilter, setCoachFilter] = useState("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [teamName, setTeamName] = useState<string | null>(null);
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);

  const teamId = searchParams.get("team_id");
  const canCreate = roles.some(r => ["admin", "club_admin", "coach"].includes(r.role));

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  // Auto-open create modal when arriving with ?new=1
  useEffect(() => {
    if (searchParams.get("new") === "1" && canCreate) {
      setShowCreateModal(true);
      const next = new URLSearchParams(searchParams);
      next.delete("new");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, canCreate, setSearchParams]);

  useEffect(() => {
    if (user) {
      fetchEvaluations();
    }
  }, [user, teamId, myAdminClubIds.join(",")]);

  useEffect(() => {
    if (teamId) {
      fetchTeamName();
    } else {
      setTeamName(null);
    }
  }, [teamId]);

  useEffect(() => {
    if (user) fetchTeams();
  }, [user]);

  const fetchTeams = async () => {
    let q = supabase
      .from("teams")
      .select("id, name, club_id")
      .is("deleted_at", null)
      .order("name");
    const { data } = await q;
    if (!isSuperAdmin && myAdminClubIds.length > 0) {
      setTeams((data || []).filter((t: any) => myAdminClubIds.includes(t.club_id)));
      return;
    }
    if (data) setTeams(data);
  };

  const fetchTeamName = async () => {
    const { data } = await supabase
      .from("teams")
      .select("name")
      .eq("id", teamId!)
      .maybeSingle();
    if (data) setTeamName(data.name);
  };

  const fetchEvaluations = async () => {
    setLoading(true);

    // Build allowed player IDs for club_admin scope (not super-admin)
    let scopedPlayerIds: string[] | null = null;
    if (!isSuperAdmin && myAdminClubIds.length > 0) {
      const { data: scopedTeams } = await supabase
        .from("teams")
        .select("id")
        .in("club_id", myAdminClubIds)
        .is("deleted_at", null);
      const teamIds = (scopedTeams || []).map((t: any) => t.id);
      if (teamIds.length === 0) {
        setEvaluations([]);
        setLoading(false);
        return;
      }
      const { data: pm } = await supabase
        .from("team_members")
        .select("user_id")
        .in("team_id", teamIds)
        .eq("member_type", "player")
        .eq("is_active", true);
      scopedPlayerIds = [...new Set((pm || []).map((m: any) => m.user_id))];
      if (scopedPlayerIds.length === 0) {
        setEvaluations([]);
        setLoading(false);
        return;
      }
    }

    if (teamId) {
      // Get player IDs in this team first
      const { data: memberData } = await supabase
        .from("team_members")
        .select("user_id")
        .eq("team_id", teamId)
        .eq("member_type", "player")
        .eq("is_active", true);

      let playerIds = memberData?.map(m => m.user_id) || [];
      if (scopedPlayerIds) {
        playerIds = playerIds.filter((pid) => scopedPlayerIds!.includes(pid));
      }

      if (playerIds.length === 0) {
        setEvaluations([]);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("evaluations")
        .select(`
          id,
          name,
          date,
          player:profiles!evaluations_player_id_fkey(id, first_name, last_name, nickname),
          coach:profiles!evaluations_coach_id_fkey(first_name, last_name)
        `)
        .is("deleted_at", null)
        .in("player_id", playerIds)
        .order("date", { ascending: false })
        .limit(50);

      if (!error && data) {
        setEvaluations(data as unknown as Evaluation[]);
      }
    } else {
      let query = supabase
        .from("evaluations")
        .select(`
          id,
          name,
          date,
          player:profiles!evaluations_player_id_fkey(id, first_name, last_name, nickname),
          coach:profiles!evaluations_coach_id_fkey(first_name, last_name)
        `)
        .is("deleted_at", null)
        .order("date", { ascending: false })
        .limit(50);
      if (scopedPlayerIds) {
        query = query.in("player_id", scopedPlayerIds);
      }
      const { data, error } = await query;

      if (!error && data) {
        setEvaluations(data as unknown as Evaluation[]);
      }
    }
    setLoading(false);
  };

  // Unique coaches for filter
  const coachOptions = (() => {
    const map = new Map<string, string>();
    evaluations.forEach((e) => {
      const name = `${e.coach?.first_name || ""} ${e.coach?.last_name || ""}`.trim();
      if (name) {
        const key = name.toLowerCase();
        if (!map.has(key)) map.set(key, name);
      }
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  })();

  const filteredEvaluations = evaluations.filter((e) => {
    const playerName = e.player?.nickname || 
      `${e.player?.first_name || ""} ${e.player?.last_name || ""}`;
    const coachName = `${e.coach?.first_name || ""} ${e.coach?.last_name || ""}`.trim().toLowerCase();
    const matchSearch = playerName.toLowerCase().includes(search.toLowerCase()) ||
      e.name.toLowerCase().includes(search.toLowerCase());
    const matchCoach = coachFilter === "all" || coachName === coachFilter;
    return matchSearch && matchCoach;
  });

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const clearTeamFilter = () => {
    setSearchParams({});
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <AppLayout>
      {teamId && (
        <Button variant="ghost" className="mb-4 -ml-2" onClick={() => navigate(`/teams/${teamId}`)}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Retour à l'équipe{teamName ? ` ${teamName}` : ""}
        </Button>
      )}
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold">Débriefs</h1>
          <p className="text-muted-foreground mt-1">
            Historique des débriefs de joueurs
          </p>
        </div>
        {canCreate && (
          <Button variant="accent" onClick={() => setShowCreateModal(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Nouveau débrief
          </Button>
        )}
      </div>

      {/* Team filter badge (from URL) */}
      {teamId && teamName && (
        <div className="flex items-center gap-2 mb-4">
          <span className="text-sm text-muted-foreground">Filtré par équipe :</span>
          <Badge variant="secondary" className="gap-1 pr-1">
            {teamName}
            <button
              onClick={clearTeamFilter}
              className="ml-1 rounded-full p-0.5 hover:bg-muted-foreground/20 transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </Badge>
        </div>
      )}

      {/* Search + Team filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher par joueur ou nom de débrief..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        {!teamId && (
          <Select
            value={searchParams.get("team_id") || "all"}
            onValueChange={(value) => {
              if (value === "all") {
                setSearchParams({});
              } else {
                setSearchParams({ team_id: value });
              }
            }}
          >
            <SelectTrigger className="w-full sm:w-[220px]">
              <SelectValue placeholder="Toutes les équipes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les équipes</SelectItem>
              {teams.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={coachFilter} onValueChange={setCoachFilter}>
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

      {/* Evaluations List */}
      {filteredEvaluations.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Trophy className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-display font-semibold mb-2">
            {search ? "Aucun résultat" : "Aucun débrief"}
          </h2>
          <p className="text-muted-foreground mb-6">
            {search
              ? "Essayez avec d'autres termes de recherche"
              : teamId
                ? "Aucun débrief pour cette équipe"
                : "Commencez par débriefer un joueur depuis sa fiche"}
          </p>
          {teamId ? (
            <Button variant="outline" onClick={clearTeamFilter}>
              Voir tous les débriefs
            </Button>
          ) : (
            <Button onClick={() => navigate("/clubs")}>
              Voir les clubs
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredEvaluations.map((evaluation) => {
            const playerName = evaluation.player?.nickname ||
              `${evaluation.player?.first_name || ""} ${evaluation.player?.last_name || ""}`.trim();
            const coachName = `${evaluation.coach?.first_name || ""} ${evaluation.coach?.last_name || ""}`.trim();

            return (
              <div
                key={evaluation.id}
                className="glass-card p-4 flex items-center gap-4 hover:border-primary/30 transition-colors cursor-pointer group"
                role="button"
                tabIndex={0}
                aria-label={`Ouvrir le débrief ${evaluation.name} de ${playerName || "joueur"}`}
                onClick={() => navigate(`/players/${evaluation.player?.id}?eval=${evaluation.id}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    navigate(`/players/${evaluation.player?.id}?eval=${evaluation.id}`);
                  }
                }}
              >
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                  <User className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{playerName || "Joueur"}</p>
                  <p className="text-sm text-muted-foreground truncate">
                    {evaluation.name}
                  </p>
                </div>
                <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="w-4 h-4" />
                  {formatDate(evaluation.date)}
                </div>
                <div className="hidden md:block text-sm text-muted-foreground">
                  par {coachName || "Coach"}
                </div>
                <button
                  type="button"
                  className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Ouvrir le débrief en plein écran"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/evaluations/${evaluation.id}`);
                  }}
                >
                  <ExternalLink className="w-4 h-4" />
                </button>
                <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
            );
          })}
        </div>
      )}

      <CreateEvaluationModal
        open={showCreateModal}
        onOpenChange={setShowCreateModal}
        onSuccess={fetchEvaluations}
        preselectedTeamId={teamId || undefined}
      />
    </AppLayout>
  );
}
