import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Trophy, Search, Calendar, User, ChevronRight, Plus } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { CreateEvaluationModal } from "@/components/modals/CreateEvaluationModal";

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
  const navigate = useNavigate();
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);

  const canCreate = roles.some(r => ["admin", "club_admin", "coach"].includes(r.role));

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      fetchEvaluations();
    }
  }, [user]);

  const fetchEvaluations = async () => {
    setLoading(true);
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
      .order("date", { ascending: false })
      .limit(50);

    if (!error && data) {
      setEvaluations(data as unknown as Evaluation[]);
    }
    setLoading(false);
  };

  const filteredEvaluations = evaluations.filter((e) => {
    const playerName = e.player?.nickname || 
      `${e.player?.first_name || ""} ${e.player?.last_name || ""}`;
    return playerName.toLowerCase().includes(search.toLowerCase()) ||
      e.name.toLowerCase().includes(search.toLowerCase());
  });

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
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
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold">Débriefs</h1>
          <p className="text-muted-foreground mt-1">
            Historique des débriefs de joueurs
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setShowCreateModal(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Nouveau débrief
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Rechercher par joueur ou nom de débrief..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 max-w-md"
        />
      </div>

      {/* Evaluations List */}
      {filteredEvaluations.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Trophy className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-display font-semibold mb-2">
            {search ? "Aucun résultat" : "Aucune évaluation"}
          </h2>
          <p className="text-muted-foreground mb-6">
            {search
              ? "Essayez avec d'autres termes de recherche"
              : "Commencez par évaluer un joueur depuis sa fiche"}
          </p>
          <Button onClick={() => navigate("/clubs")}>
            Voir les clubs
          </Button>
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
                onClick={() => navigate(`/players/${evaluation.player?.id}`)}
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
      />
    </AppLayout>
  );
}
