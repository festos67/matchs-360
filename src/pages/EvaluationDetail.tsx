/**
 * @page EvaluationDetail
 * @route /evaluations/:id
 * @description Fiche détaillée d'une évaluation : header (joueur, équipe, date,
 *              auteur), formulaire en lecture par défaut, bascule édition avec
 *              confirmation (cf. F9). Réutilise EvaluationForm — pas de
 *              duplication.
 * @access Admin, Club Admin, Coach (édition possible si type="coach").
 */
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Pencil, X, Loader2 } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EvaluationForm } from "@/components/evaluation/EvaluationForm";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { loadFrameworkThemes, type FrameworkTheme } from "@/lib/framework-loader";
import { toast } from "sonner";

interface EvaluationData {
  id: string;
  name: string;
  date: string;
  type: "coach" | "self" | "supporter";
  framework_id: string;
  player_id: string;
  evaluator_id: string;
  scores: Array<{
    skill_id: string;
    score: number | null;
    is_not_observed: boolean;
    comment: string | null;
  }>;
  objectives: Array<{ theme_id: string; content: string }>;
}

export default function EvaluationDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { roles } = useAuth();
  const canEvaluate = roles.some((r) =>
    ["admin", "club_admin", "coach"].includes(r.role)
  );

  const [evaluation, setEvaluation] = useState<EvaluationData | null>(null);
  const [themes, setThemes] = useState<FrameworkTheme[]>([]);
  const [player, setPlayer] = useState<{
    id: string;
    first_name: string | null;
    last_name: string | null;
    nickname: string | null;
  } | null>(null);
  const [team, setTeam] = useState<{
    id: string;
    name: string;
    club_name: string | null;
  } | null>(null);
  const [author, setAuthor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [showEditConfirm, setShowEditConfirm] = useState(false);

  useEffect(() => {
    if (id) fetchEvaluation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fetchEvaluation = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("evaluations")
        .select(
          `
          id, name, date, type, framework_id, player_id, evaluator_id, deleted_at,
          scores:evaluation_scores(skill_id, score, is_not_observed, comment),
          objectives:evaluation_objectives(theme_id, content)
        `
        )
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data || (data as any).deleted_at) {
        toast.error("Évaluation introuvable");
        navigate("/evaluations");
        return;
      }

      setEvaluation(data as unknown as EvaluationData);

      // Player
      const { data: playerRes } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, nickname")
        .eq("id", data.player_id)
        .maybeSingle();
      setPlayer(playerRes ?? null);

      // Author (evaluator)
      let authorName: string | null = null;
      if (data.evaluator_id) {
        const { data: authorRes } = await supabase
          .from("profiles")
          .select("first_name, last_name")
          .eq("id", data.evaluator_id)
          .maybeSingle();
        authorName = authorRes
          ? `${authorRes.first_name || ""} ${authorRes.last_name || ""}`.trim() || null
          : null;
      }
      setAuthor(authorName);

      // Themes
      const { themes: loadedThemes } = await loadFrameworkThemes(
        data.framework_id
      );
      setThemes(loadedThemes);

      // Team via player active membership (evaluations has no team_id column)
      const { data: membership } = await supabase
        .from("team_members")
        .select("team_id, teams!inner(id, name, deleted_at, clubs(name))")
        .eq("user_id", data.player_id)
        .eq("member_type", "player")
        .eq("is_active", true)
        .is("teams.deleted_at", null)
        .limit(1)
        .maybeSingle();
      if (membership && (membership as any).teams) {
        const t = (membership as any).teams;
        setTeam({
          id: t.id,
          name: t.name,
          club_name: t.clubs?.name || null,
        });
      } else {
        setTeam(null);
      }
    } catch (err: any) {
      console.error("EvaluationDetail fetch error:", err);
      toast.error("Erreur de chargement", { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (!evaluation || !player) return null;

  const playerName =
    player.nickname?.trim() ||
    `${player.first_name || ""} ${player.last_name || ""}`.trim() ||
    "(sans nom)";

  const typeLabel =
    evaluation.type === "coach"
      ? "Coach"
      : evaluation.type === "self"
      ? "Auto-débrief"
      : "Supporter";

  const canEditThis = canEvaluate && evaluation.type === "coach";

  return (
    <AppLayout>
      <div className="space-y-6">
        <Button
          variant="ghost"
          className="-ml-2"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="w-4 h-4 mr-1" /> Retour
        </Button>

        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row gap-4 items-start justify-between">
              <div className="min-w-0 space-y-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
                    {evaluation.name}
                  </h1>
                  <Badge variant="outline">{typeLabel}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Joueur :{" "}
                  <button
                    onClick={() => navigate(`/players/${player.id}`)}
                    className="underline hover:text-foreground"
                  >
                    {playerName}
                  </button>
                  {team && (
                    <>
                      {" "}
                      · Équipe :{" "}
                      <button
                        onClick={() => navigate(`/teams/${team.id}`)}
                        className="underline hover:text-foreground"
                      >
                        {team.name}
                      </button>
                    </>
                  )}
                  {team?.club_name && <> · {team.club_name}</>}
                </p>
                <p className="text-sm text-muted-foreground">
                  {new Date(evaluation.date).toLocaleDateString("fr-FR", {
                    dateStyle: "long",
                  })}
                  {author && <> · par {author}</>}
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 shrink-0">
                {canEditThis &&
                  (isEditing ? (
                    <Button
                      variant="ghost"
                      onClick={() => setIsEditing(false)}
                    >
                      <X className="w-4 h-4 mr-1" />
                      Annuler la modification
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      onClick={() => setShowEditConfirm(true)}
                    >
                      <Pencil className="w-4 h-4 mr-1 text-blue-500" />
                      Modifier
                    </Button>
                  ))}
                <Button
                  variant="outline"
                  onClick={() => navigate(`/players/${player.id}`)}
                >
                  Voir la fiche complète →
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {team && themes.length > 0 ? (
          <EvaluationForm
            key={`${evaluation.id}-${isEditing ? "edit" : "view"}`}
            playerId={player.id}
            playerName={playerName}
            frameworkId={evaluation.framework_id}
            themes={themes as any}
            existingEvaluation={{
              id: evaluation.id,
              name: evaluation.name,
              date: evaluation.date,
              scores: evaluation.scores || [],
              objectives: evaluation.objectives || [],
            }}
            readOnly={!isEditing}
            historyEditWarning={isEditing}
            onSaved={async () => {
              setIsEditing(false);
              await fetchEvaluation();
            }}
          />
        ) : (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Impossible d'afficher le formulaire (équipe ou référentiel manquant).
          </p>
        )}
      </div>

      <AlertDialog open={showEditConfirm} onOpenChange={setShowEditConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Modifier ce débrief ?</AlertDialogTitle>
            <AlertDialogDescription>
              La modification sera tracée dans l'audit log avec votre identité
              et l'horodatage. Préférez-vous créer un nouveau débrief à la place
              pour préserver l'historique ?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => {
                setShowEditConfirm(false);
                navigate(`/players/${player.id}?new=1`);
              }}
            >
              Créer un nouveau débrief
            </Button>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                setShowEditConfirm(false);
                setIsEditing(true);
              }}
            >
              Modifier quand même
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}