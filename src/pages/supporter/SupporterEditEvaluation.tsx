/**
 * @page SupporterEditEvaluation
 * @route /supporter/edit/:evaluationId
 *
 * Permet à un supporter de modifier son propre dernier débrief sur un joueur.
 * Recharge l'évaluation existante (scores, commentaires, objectifs) et réutilise
 * SupporterEvaluationForm en mode édition.
 *
 * @access Supporter (auteur de l'évaluation)
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, AlertTriangle, Heart } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SupporterEvaluationForm } from "@/components/evaluation/SupporterEvaluationForm";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Theme {
  id: string;
  name: string;
  color: string | null;
  order_index: number;
  skills: Array<{
    id: string;
    name: string;
    definition: string | null;
    order_index: number;
  }>;
}

export default function SupporterEditEvaluation() {
  const { evaluationId } = useParams<{ evaluationId: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading, currentRole } = useAuth();

  const [loading, setLoading] = useState(true);
  const [playerId, setPlayerId] = useState<string>("");
  const [playerName, setPlayerName] = useState("Joueur");
  const [teamId, setTeamId] = useState<string>("");
  const [frameworkId, setFrameworkId] = useState<string | null>(null);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [initialScores, setInitialScores] = useState<Record<string, number | null>>({});
  const [initialNotObserved, setInitialNotObserved] = useState<Record<string, boolean>>({});
  const [initialComments, setInitialComments] = useState<Record<string, string>>({});
  const [initialObjectives, setInitialObjectives] = useState<Record<string, string>>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  useEffect(() => {
    if (!authLoading && (!user || currentRole?.role !== "supporter")) {
      navigate("/dashboard", { replace: true });
    }
  }, [user, authLoading, currentRole, navigate]);

  useEffect(() => {
    if (!user || !evaluationId) return;
    (async () => {
      try {
        const { data: evalData, error: evalErr } = await supabase
          .from("evaluations")
          .select("id, player_id, framework_id, evaluator_id, type, deleted_at")
          .eq("id", evaluationId)
          .maybeSingle();
        if (evalErr) throw evalErr;
        if (!evalData || evalData.evaluator_id !== user.id || evalData.type !== "supporter" || evalData.deleted_at) {
          toast.error("Débrief non disponible");
          navigate(-1);
          return;
        }

        setPlayerId(evalData.player_id);
        setFrameworkId(evalData.framework_id);

        // Player profile
        const { data: prof } = await supabase
          .from("profiles")
          .select("first_name, last_name, nickname")
          .eq("id", evalData.player_id)
          .maybeSingle();
        if (prof) {
          setPlayerName(prof.nickname || `${prof.first_name ?? ""} ${prof.last_name ?? ""}`.trim() || "Joueur");
        }

        // Team (from active membership)
        const { data: mem } = await supabase
          .from("team_members")
          .select("team_id")
          .eq("user_id", evalData.player_id)
          .eq("member_type", "player")
          .eq("is_active", true)
          .is("deleted_at", null)
          .maybeSingle();
        if (mem) setTeamId(mem.team_id);

        // Themes
        const { data: themesData } = await supabase
          .from("themes")
          .select("*, skills(*)")
          .eq("framework_id", evalData.framework_id)
          .order("order_index");
        const sorted: Theme[] = (themesData || []).map((t: any) => ({
          ...t,
          skills: (t.skills || []).sort((a: any, b: any) => a.order_index - b.order_index),
        }));
        setThemes(sorted);

        // Existing scores
        const { data: scoresData } = await supabase
          .from("evaluation_scores")
          .select("skill_id, score, is_not_observed, comment")
          .eq("evaluation_id", evaluationId);

        const sMap: Record<string, number | null> = {};
        const noMap: Record<string, boolean> = {};
        const cMap: Record<string, string> = {};
        (scoresData || []).forEach((s: any) => {
          sMap[s.skill_id] = s.score;
          noMap[s.skill_id] = !!s.is_not_observed;
          if (s.comment) cMap[s.skill_id] = s.comment;
        });
        setInitialScores(sMap);
        setInitialNotObserved(noMap);
        setInitialComments(cMap);

        // Existing objectives
        const { data: objData } = await supabase
          .from("evaluation_objectives")
          .select("theme_id, content")
          .eq("evaluation_id", evaluationId);
        const oMap: Record<string, string> = {};
        (objData || []).forEach((o: any) => {
          oMap[o.theme_id] = o.content;
        });
        setInitialObjectives(oMap);
      } catch (err) {
        console.error(err);
        toast.error("Erreur lors du chargement");
      } finally {
        setLoading(false);
      }
    })();
  }, [user, evaluationId, navigate]);

  const handleBack = () => {
    if (hasUnsavedChanges && !confirm("Vous avez des modifications non enregistrées. Quitter quand même ?")) return;
    navigate(-1);
  };

  if (authLoading || loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      </AppLayout>
    );
  }

  if (!frameworkId || themes.length === 0) {
    return (
      <AppLayout>
        <Button variant="ghost" className="mb-6 -ml-2" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Retour
        </Button>
        <div className="glass-card p-12 text-center">
          <AlertTriangle className="w-16 h-16 mx-auto text-warning/50 mb-4" />
          <h3 className="text-lg font-medium text-muted-foreground">Débrief non disponible</h3>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <Button variant="ghost" className="mb-6 -ml-2" onClick={handleBack}>
        <ArrowLeft className="w-4 h-4 mr-2" /> Retour
      </Button>

      <div className="glass-card p-6 mb-8 bg-gradient-to-r from-orange-500/10 to-amber-500/10 border-orange-500/30">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-lg shrink-0">
            {playerName.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-display font-bold text-foreground">
                Modifier mon débrief de {playerName}
              </h1>
              <Badge variant="outline" className="bg-orange-500/20 text-orange-600 border-orange-500/30">
                Édition
              </Badge>
            </div>
            <p className="text-muted-foreground">
              Ajustez vos évaluations puis enregistrez pour mettre à jour votre débrief.
            </p>
          </div>
          <div className="w-14 h-14 rounded-xl bg-orange-500/20 flex items-center justify-center shrink-0">
            <Heart className="w-7 h-7 text-orange-500" />
          </div>
        </div>
      </div>

      <SupporterEvaluationForm
        playerId={playerId}
        playerName={playerName}
        teamId={teamId}
        frameworkId={frameworkId}
        themes={themes}
        hasStarted
        existingEvaluationId={evaluationId}
        initialScores={initialScores}
        initialNotObserved={initialNotObserved}
        initialComments={initialComments}
        initialObjectives={initialObjectives}
        onUnsavedChangesChange={setHasUnsavedChanges}
        onSaved={() => {
          toast.success("Débrief mis à jour");
          navigate(-1);
        }}
      />
    </AppLayout>
  );
}