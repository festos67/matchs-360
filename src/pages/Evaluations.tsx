/**
 * @page Evaluations
 * @route /evaluations
 *
 * Liste centralisée des débriefs (évaluations), structurée en 3 sections :
 *  - Débriefs coach (type='coach')
 *  - Auto-débriefs joueurs (type='self')
 *  - Débriefs supporters (type='supporter')
 *
 * Chaque section dispose de ses propres filtres (texte + équipe + auteur/joueur).
 * Le filtre "coach" de la section coach n'inclut que les auteurs de débriefs
 * coach (excluant donc supporters et joueurs).
 */
import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Trophy,
  Search,
  Calendar,
  User,
  ChevronRight,
  Plus,
  X,
  ArrowLeft,
  ExternalLink,
  UserCog,
  UserCircle,
  Heart,
  ChevronDown,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { CreateEvaluationModal } from "@/components/modals/CreateEvaluationModal";
import { useClubAdminScope } from "@/hooks/useClubAdminScope";

type EvalType = "coach" | "self" | "supporter";

interface Evaluation {
  id: string;
  name: string;
  date: string;
  type: EvalType;
  evaluator_id: string;
  player: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    nickname: string | null;
  } | null;
  evaluator: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    nickname: string | null;
  } | null;
}

const personName = (p: {
  first_name?: string | null;
  last_name?: string | null;
  nickname?: string | null;
} | null | undefined) => {
  if (!p) return "";
  return (
    p.nickname ||
    `${p.first_name || ""} ${p.last_name || ""}`.trim()
  );
};

const formatDate = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

export default function Evaluations() {
  const { user, loading: authLoading, roles } = useAuth();
  const { isSuperAdmin, myAdminClubIds } = useClubAdminScope();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [playerTeams, setPlayerTeams] = useState<Record<string, string[]>>({});
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [teamName, setTeamName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const teamId = searchParams.get("team_id");
  const canCreate = roles.some((r) =>
    ["admin", "club_admin", "coach"].includes(r.role)
  );

  // Per-section filters
  const [coachSearch, setCoachSearch] = useState("");
  const [coachTeam, setCoachTeam] = useState<string>(teamId || "all");
  const [coachAuthor, setCoachAuthor] = useState<string>("all");

  const [selfSearch, setSelfSearch] = useState("");
  const [selfTeam, setSelfTeam] = useState<string>(teamId || "all");
  const [selfPlayer, setSelfPlayer] = useState<string>("all");

  const [suppSearch, setSuppSearch] = useState("");
  const [suppTeam, setSuppTeam] = useState<string>(teamId || "all");
  const [suppAuthor, setSuppAuthor] = useState<string>("all");

  // Collapsible open state per section
  const [coachOpen, setCoachOpen] = useState(true);
  const [selfOpen, setSelfOpen] = useState(true);
  const [suppOpen, setSuppOpen] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

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
      fetchTeams();
      fetchEvaluations();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, myAdminClubIds.join(",")]);

  useEffect(() => {
    if (teamId) {
      setCoachTeam(teamId);
      setSelfTeam(teamId);
      setSuppTeam(teamId);
      supabase
        .from("teams")
        .select("name")
        .eq("id", teamId)
        .maybeSingle()
        .then(({ data }) => setTeamName(data?.name ?? null));
    } else {
      setTeamName(null);
    }
  }, [teamId]);

  const fetchTeams = async () => {
    const { data } = await supabase
      .from("teams")
      .select("id, name, club_id")
      .is("deleted_at", null)
      .order("name");
    if (!data) return;
    if (!isSuperAdmin && myAdminClubIds.length > 0) {
      setTeams(data.filter((t: any) => myAdminClubIds.includes(t.club_id)));
    } else {
      setTeams(data);
    }
  };

  const fetchEvaluations = async () => {
    setLoading(true);

    // Compute scoped player IDs for club admins
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
        setPlayerTeams({});
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
        setPlayerTeams({});
        setLoading(false);
        return;
      }
    }

    let query = supabase
      .from("evaluations")
      .select(
        `
          id,
          name,
          date,
          type,
          evaluator_id,
          player:profiles!evaluations_player_id_fkey(id, first_name, last_name, nickname),
          evaluator:profiles!evaluations_coach_id_fkey(id, first_name, last_name, nickname)
        `
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(200);

    if (scopedPlayerIds) query = query.in("player_id", scopedPlayerIds);

    const { data, error } = await query;
    if (error || !data) {
      setEvaluations([]);
      setPlayerTeams({});
      setLoading(false);
      return;
    }

    const evals = data as unknown as Evaluation[];
    setEvaluations(evals);

    // Build player -> teams map
    const playerIds = [
      ...new Set(evals.map((e) => e.player?.id).filter(Boolean) as string[]),
    ];
    if (playerIds.length > 0) {
      const { data: tm } = await supabase
        .from("team_members")
        .select("user_id, team_id")
        .in("user_id", playerIds)
        .eq("member_type", "player")
        .eq("is_active", true);
      const map: Record<string, string[]> = {};
      (tm || []).forEach((row: any) => {
        if (!map[row.user_id]) map[row.user_id] = [];
        map[row.user_id].push(row.team_id);
      });
      setPlayerTeams(map);
    } else {
      setPlayerTeams({});
    }

    setLoading(false);
  };

  const clearTeamFilter = () => setSearchParams({});

  // Split by type
  const coachEvals = useMemo(
    () => evaluations.filter((e) => e.type === "coach"),
    [evaluations]
  );
  const selfEvals = useMemo(
    () => evaluations.filter((e) => e.type === "self"),
    [evaluations]
  );
  const supporterEvals = useMemo(
    () => evaluations.filter((e) => e.type === "supporter"),
    [evaluations]
  );

  // Filter helpers
  const matchesTeam = (e: Evaluation, tid: string) => {
    if (tid === "all") return true;
    const tids = e.player?.id ? playerTeams[e.player.id] || [] : [];
    return tids.includes(tid);
  };
  const matchesText = (e: Evaluation, q: string) => {
    if (!q.trim()) return true;
    const ql = q.toLowerCase();
    return (
      e.name.toLowerCase().includes(ql) ||
      personName(e.player).toLowerCase().includes(ql) ||
      personName(e.evaluator).toLowerCase().includes(ql)
    );
  };

  // Author options derived from each section's evals (so supporters never appear in coach filter)
  const buildAuthorOptions = (list: Evaluation[]) => {
    const map = new Map<string, string>();
    list.forEach((e) => {
      if (!e.evaluator?.id) return;
      const name = personName(e.evaluator);
      if (name) map.set(e.evaluator.id, name);
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  };
  const buildPlayerOptions = (list: Evaluation[]) => {
    const map = new Map<string, string>();
    list.forEach((e) => {
      if (!e.player?.id) return;
      const name = personName(e.player);
      if (name) map.set(e.player.id, name);
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  };

  const coachAuthorOptions = useMemo(() => buildAuthorOptions(coachEvals), [coachEvals]);
  const selfPlayerOptions = useMemo(() => buildPlayerOptions(selfEvals), [selfEvals]);
  const suppAuthorOptions = useMemo(
    () => buildAuthorOptions(supporterEvals),
    [supporterEvals]
  );

  const filteredCoach = useMemo(
    () =>
      coachEvals.filter(
        (e) =>
          matchesText(e, coachSearch) &&
          matchesTeam(e, coachTeam) &&
          (coachAuthor === "all" || e.evaluator_id === coachAuthor)
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [coachEvals, coachSearch, coachTeam, coachAuthor, playerTeams]
  );
  const filteredSelf = useMemo(
    () =>
      selfEvals.filter(
        (e) =>
          matchesText(e, selfSearch) &&
          matchesTeam(e, selfTeam) &&
          (selfPlayer === "all" || e.player?.id === selfPlayer)
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selfEvals, selfSearch, selfTeam, selfPlayer, playerTeams]
  );
  const filteredSupp = useMemo(
    () =>
      supporterEvals.filter(
        (e) =>
          matchesText(e, suppSearch) &&
          matchesTeam(e, suppTeam) &&
          (suppAuthor === "all" || e.evaluator_id === suppAuthor)
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [supporterEvals, suppSearch, suppTeam, suppAuthor, playerTeams]
  );

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const renderEvalCard = (evaluation: Evaluation) => {
    const playerName = personName(evaluation.player) || "Joueur";
    const authorName = personName(evaluation.evaluator);
    const authorLabel =
      evaluation.type === "coach"
        ? `par ${authorName || "Coach"}`
        : evaluation.type === "self"
          ? "Auto-débrief"
          : `par ${authorName || "Supporter"}`;
    return (
      <div
        key={evaluation.id}
        className="glass-card p-4 flex items-center gap-4 hover:border-primary/30 transition-colors cursor-pointer group"
        role="button"
        tabIndex={0}
        aria-label={`Ouvrir le débrief ${evaluation.name} de ${playerName}`}
        onClick={() =>
          evaluation.player?.id &&
          navigate(
            `/players/${evaluation.player.id}?evaluation=${evaluation.id}`
          )
        }
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && evaluation.player?.id) {
            e.preventDefault();
            navigate(
              `/players/${evaluation.player.id}?evaluation=${evaluation.id}`
            );
          }
        }}
      >
        <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
          <User className="w-6 h-6 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{playerName}</p>
          <p className="text-sm text-muted-foreground truncate">
            {evaluation.name}
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
          <Calendar className="w-4 h-4" />
          {formatDate(evaluation.date)}
        </div>
        <div className="hidden md:block text-sm text-muted-foreground">
          {authorLabel}
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
  };

  const renderSection = (params: {
    title: string;
    icon: React.ReactNode;
    list: Evaluation[];
    search: string;
    setSearch: (v: string) => void;
    teamValue: string;
    setTeamValue: (v: string) => void;
    secondLabel: string;
    secondValue: string;
    setSecondValue: (v: string) => void;
    secondOptions: [string, string][];
    emptyText: string;
    open: boolean;
    setOpen: (v: boolean) => void;
  }) => {
    return (
      <section className="mb-10">
        <button
          type="button"
          onClick={() => params.setOpen(!params.open)}
          aria-expanded={params.open}
          className="w-full flex items-center gap-2 mb-3 group"
        >
          <ChevronDown
            className={`w-5 h-5 text-muted-foreground transition-transform ${
              params.open ? "" : "-rotate-90"
            }`}
          />
          {params.icon}
          <h2 className="text-xl font-display font-semibold">{params.title}</h2>
          <Badge variant="secondary">{params.list.length}</Badge>
        </button>
        {params.open && (
        <>
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher..."
              value={params.search}
              onChange={(e) => params.setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={params.teamValue} onValueChange={params.setTeamValue}>
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
          <Select
            value={params.secondValue}
            onValueChange={params.setSecondValue}
          >
            <SelectTrigger className="w-full sm:w-[220px]">
              <SelectValue placeholder={params.secondLabel} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{params.secondLabel}</SelectItem>
              {params.secondOptions.map(([id, name]) => (
                <SelectItem key={id} value={id}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {params.list.length === 0 ? (
          <div className="glass-card p-8 text-center text-muted-foreground text-sm">
            {params.emptyText}
          </div>
        ) : (
          <div className="space-y-3">{params.list.map(renderEvalCard)}</div>
        )}
        </>
        )}
      </section>
    );
  };

  return (
    <AppLayout>
      {teamId && (
        <Button
          variant="ghost"
          className="mb-4 -ml-2"
          onClick={() => navigate(`/teams/${teamId}`)}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Retour à l'équipe{teamName ? ` ${teamName}` : ""}
        </Button>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold">Débriefs</h1>
          <p className="text-muted-foreground mt-1">
            Historique des débriefs, classés par catégorie
          </p>
        </div>
        {canCreate && (
          <Button
            variant="accent"
            onClick={() => setShowCreateModal(true)}
            className="gap-2"
          >
            <Plus className="w-4 h-4" />
            Nouveau débrief
          </Button>
        )}
      </div>

      {teamId && teamName && (
        <div className="flex items-center gap-2 mb-6">
          <span className="text-sm text-muted-foreground">
            Pré-filtré par équipe :
          </span>
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

      {evaluations.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Trophy className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-display font-semibold mb-2">
            Aucun débrief
          </h2>
          <p className="text-muted-foreground mb-6">
            Commencez par débriefer un joueur depuis sa fiche
          </p>
          <Button onClick={() => navigate("/clubs")}>Voir les clubs</Button>
        </div>
      ) : (
        <>
          {renderSection({
            title: "Débriefs coach",
            icon: <UserCog className="w-5 h-5 text-orange-500" />,
            list: filteredCoach,
            search: coachSearch,
            setSearch: setCoachSearch,
            teamValue: coachTeam,
            setTeamValue: setCoachTeam,
            secondLabel: "Tous les coachs",
            secondValue: coachAuthor,
            setSecondValue: setCoachAuthor,
            secondOptions: coachAuthorOptions,
            emptyText: "Aucun débrief coach",
            open: coachOpen,
            setOpen: setCoachOpen,
          })}
          {renderSection({
            title: "Auto-débriefs joueurs",
            icon: <UserCircle className="w-5 h-5 text-green-500" />,
            list: filteredSelf,
            search: selfSearch,
            setSearch: setSelfSearch,
            teamValue: selfTeam,
            setTeamValue: setSelfTeam,
            secondLabel: "Tous les joueurs",
            secondValue: selfPlayer,
            setSecondValue: setSelfPlayer,
            secondOptions: selfPlayerOptions,
            emptyText: "Aucun auto-débrief",
            open: selfOpen,
            setOpen: setSelfOpen,
          })}
          {renderSection({
            title: "Débriefs supporters",
            icon: <Heart className="w-5 h-5 text-pink-500" />,
            list: filteredSupp,
            search: suppSearch,
            setSearch: setSuppSearch,
            teamValue: suppTeam,
            setTeamValue: setSuppTeam,
            secondLabel: "Tous les supporters",
            secondValue: suppAuthor,
            setSecondValue: setSuppAuthor,
            secondOptions: suppAuthorOptions,
            emptyText: "Aucun débrief supporter",
            open: suppOpen,
            setOpen: setSuppOpen,
          })}
        </>
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