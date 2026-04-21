/**
 * @component SelfEvaluationForm
 * @description Formulaire d'auto-débrief réservé aux joueurs. Variante simplifiée
 *              de EvaluationForm sans objectifs ni références score précédent.
 *              Les auto-débriefs sont consultatifs (exclus des stats officielles).
 * @access Joueur uniquement (sur sa propre fiche)
 * @features
 *  - ThemeAccordion + StarRating + commentaires
 *  - EvaluationRadar live pendant la saisie
 *  - Pas de génération d'objectifs (réservée au coach)
 *  - Création évaluation type='self' avec evaluator_id = player_id
 *  - Brouillon localStorage pour reprise
 * @maintenance
 *  - Type consultatif exclu stats : mem://logic/assessment-data-isolation-rules
 *  - Restrictions UI joueur : mem://features/player/interface-restrictions
 *  - Disponibilité : nécessite team_membership (mem://logic/player-debrief-availability)
 */
import { useState, useMemo } from "react";
import { Save, RotateCcw, FileText, Calendar, Loader2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeAccordion } from "./ThemeAccordion";
import { EvaluationRadar } from "./EvaluationRadar";
import { 
  calculateRadarData, 
  calculateOverallAverage, 
  formatAverage,
  type ThemeScores,
} from "@/lib/evaluation-utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { usePlanLimitHandler } from "@/hooks/usePlanLimitHandler";

interface Theme {
  id: string;
  name: string;
  color: string | null;
  order_index: number;
  skills: Skill[];
}

interface Skill {
  id: string;
  name: string;
  definition: string | null;
  order_index: number;
}

interface SelfEvaluationFormProps {
  playerId: string;
  playerName: string;
  teamId: string;
  frameworkId: string;
  themes: Theme[];
  existingEvaluation?: {
    id: string;
    name: string;
    date: string;
    scores: Array<{
      skill_id: string;
      score: number | null;
      is_not_observed: boolean;
      comment: string | null;
    }>;
    objectives: Array<{
      theme_id: string;
      content: string;
    }>;
  } | null;
  onSaved?: () => void;
}

export const SelfEvaluationForm = ({
  playerId,
  playerName,
  teamId,
  frameworkId,
  themes,
  existingEvaluation,
  onSaved,
}: SelfEvaluationFormProps) => {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const { handle: planLimitHandle, dialog: planLimitDialog } = usePlanLimitHandler();
  const [evaluationName, setEvaluationName] = useState(
    existingEvaluation?.name || `AUTO-${playerName}-${new Date().toLocaleDateString("fr-FR")}`
  );

  // Initialize scores state
  const [themeScores, setThemeScores] = useState<ThemeScores[]>(() => {
    return themes.map((theme) => ({
      theme_id: theme.id,
      theme_name: theme.name,
      theme_color: theme.color,
      skills: theme.skills.map((skill) => {
        const existingScore = existingEvaluation?.scores.find(
          (s) => s.skill_id === skill.id
        );
        return {
          skill_id: skill.id,
          score: existingScore?.score ?? null,
          is_not_observed: existingScore?.is_not_observed ?? false,
          comment: existingScore?.comment ?? null,
        };
      }),
      objective: existingEvaluation?.objectives.find(
        (o) => o.theme_id === theme.id
      )?.content ?? null,
    }));
  });

  // Calculate radar data in real-time
  const radarData = useMemo(() => calculateRadarData(themeScores), [themeScores]);
  const overallAverage = useMemo(() => calculateOverallAverage(themeScores), [themeScores]);

  // Update handlers
  const handleScoreChange = (themeId: string, skillId: string, score: number) => {
    setThemeScores((prev) =>
      prev.map((theme) =>
        theme.theme_id === themeId
          ? {
              ...theme,
              skills: theme.skills.map((skill) =>
                skill.skill_id === skillId ? { ...skill, score } : skill
              ),
            }
          : theme
      )
    );
  };

  const handleNotObservedChange = (themeId: string, skillId: string, isNotObserved: boolean) => {
    setThemeScores((prev) =>
      prev.map((theme) =>
        theme.theme_id === themeId
          ? {
              ...theme,
              skills: theme.skills.map((skill) =>
                skill.skill_id === skillId
                  ? { ...skill, is_not_observed: isNotObserved }
                  : skill
              ),
            }
          : theme
      )
    );
  };

  const handleCommentChange = (themeId: string, skillId: string, comment: string) => {
    setThemeScores((prev) =>
      prev.map((theme) =>
        theme.theme_id === themeId
          ? {
              ...theme,
              skills: theme.skills.map((skill) =>
                skill.skill_id === skillId ? { ...skill, comment } : skill
              ),
            }
          : theme
      )
    );
  };

  const handleObjectiveChange = (themeId: string, objective: string) => {
    setThemeScores((prev) =>
      prev.map((theme) =>
        theme.theme_id === themeId ? { ...theme, objective } : theme
      )
    );
  };

  const handleReset = () => {
    setThemeScores(
      themes.map((theme) => ({
        theme_id: theme.id,
        theme_name: theme.name,
        theme_color: theme.color,
        skills: theme.skills.map((skill) => ({
          skill_id: skill.id,
          score: null as number | null,
          is_not_observed: false,
          comment: null as string | null,
        })),
        objective: null as string | null,
      }))
    );
  };

  const generateUniqueName = async (baseName: string): Promise<string> => {
    // Check if an evaluation with this name already exists for this player
    const { data: existingEvaluations } = await supabase
      .from("evaluations")
      .select("name")
      .eq("player_id", playerId)
      .eq("type", "self")
      .is("deleted_at", null)
      .ilike("name", `${baseName}%`);

    if (!existingEvaluations || existingEvaluations.length === 0) {
      return baseName;
    }

    // Check if the exact name exists
    const exactMatch = existingEvaluations.some(e => e.name === baseName);
    if (!exactMatch) {
      return baseName;
    }

    // Generate unique name with number, date and time
    const now = new Date();
    const today = now.toLocaleDateString("fr-FR");
    const time = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    let counter = 2;
    let uniqueName = `${baseName} #${counter} - ${today} ${time}`;

    while (existingEvaluations.some(e => e.name === uniqueName)) {
      counter++;
      uniqueName = `${baseName} #${counter} - ${today} ${time}`;
    }

    return uniqueName;
  };

  const handleSave = async () => {
    if (!user) {
      toast.error("Vous devez être connecté");
      return;
    }

    setSaving(true);
    try {
      let evaluationId = existingEvaluation?.id;

      if (evaluationId) {
        // Update existing self-evaluation
        const { error: updateErr } = await supabase
          .from("evaluations")
          .update({
            name: evaluationName,
            date: new Date().toISOString(),
          })
          .eq("id", evaluationId);

        if (updateErr) throw updateErr;
      } else {
        // Generate unique name if needed
        const uniqueName = await generateUniqueName(evaluationName);

        // Create new self-evaluation
        // Note: For self-assessments, evaluator_id = player_id (the player is evaluating themselves)
        const { data: newEval, error } = await supabase
          .from("evaluations")
          .insert({
            player_id: playerId,
            evaluator_id: user.id, // The player's own ID
            framework_id: frameworkId,
            name: uniqueName,
            type: "self",
          })
          .select()
          .single();

        if (error) throw error;
        evaluationId = newEval.id;
      }

      // Upsert scores
      const scoresToUpsert = themeScores.flatMap((theme) =>
        theme.skills.map((skill) => ({
          evaluation_id: evaluationId,
          skill_id: skill.skill_id,
          score: skill.score,
          is_not_observed: skill.is_not_observed,
          comment: skill.comment,
        }))
      );

      // Delete existing scores and insert new ones
      const { error: delScoresErr } = await supabase
        .from("evaluation_scores")
        .delete()
        .eq("evaluation_id", evaluationId);

      if (delScoresErr) throw delScoresErr;

      if (scoresToUpsert.length > 0) {
        const { error: scoresError } = await supabase
          .from("evaluation_scores")
          .insert(scoresToUpsert);

        if (scoresError) throw scoresError;
      }

      // Upsert objectives
      const { error: delObjErr } = await supabase
        .from("evaluation_objectives")
        .delete()
        .eq("evaluation_id", evaluationId);

      if (delObjErr) throw delObjErr;

      const objectivesToInsert = themeScores
        .filter((theme) => theme.objective)
        .map((theme) => ({
          evaluation_id: evaluationId,
          theme_id: theme.theme_id,
          content: theme.objective!,
        }));

      if (objectivesToInsert.length > 0) {
        const { error: objError } = await supabase
          .from("evaluation_objectives")
          .insert(objectivesToInsert);

        if (objError) throw objError;
      }

      toast.success("Auto-débrief enregistré avec succès");
      document.querySelector("main")?.scrollTo({ top: 0, behavior: "smooth" });
      onSaved?.();
    } catch (error: any) {
      console.error("Error saving self-evaluation:", error);
      if (planLimitHandle(error, "self_evals")) {
        setSaving(false);
        return;
      }
      toast.error("Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  // Self-evaluation uses a distinct teal/emerald color scheme
  const selfEvalColor = "#10B981"; // Emerald-500

  return (
    <div className="space-y-6 pb-20">
      {/* Header with radar and summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Radar Chart - with distinct color for self-evaluation */}
        <div className="glass-card p-6 border-2 border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 to-teal-500/5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-display font-semibold text-lg flex items-center gap-2">
                <Star className="w-5 h-5 text-emerald-500" />
                Ma Vue Radar
              </h3>
              <p className="text-sm text-muted-foreground">Mise à jour en temps réel</p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-display font-bold text-emerald-500">
                {formatAverage(overallAverage)}
              </p>
              <p className="text-sm text-muted-foreground">Ma moyenne</p>
            </div>
          </div>
          <EvaluationRadar data={radarData} primaryColor={selfEvalColor} />
        </div>

        {/* Evaluation info */}
        <div className="glass-card p-6 border-2 border-emerald-500/30">
          <h3 className="font-display font-semibold text-lg mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-emerald-500" />
            Informations
          </h3>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="evaluationName">Titre de l'auto-débrief</Label>
              <Input
                id="evaluationName"
                value={evaluationName}
                onChange={(e) => setEvaluationName(e.target.value)}
                placeholder="Titre du débrief..."
                className="border-emerald-500/30 focus-visible:ring-emerald-500"
              />
            </div>

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="w-4 h-4" />
              <span>
                {existingEvaluation
                  ? `Dernière modification: ${new Date(existingEvaluation.date).toLocaleDateString("fr-FR")}`
                  : `Nouvel auto-débrief - ${new Date().toLocaleDateString("fr-FR")}`}
              </span>
            </div>

            {/* Score summary */}
            <div className="pt-4 border-t border-border">
              <h4 className="text-sm font-medium mb-3">Ma perception par thématique</h4>
              <div className="space-y-2">
                {themeScores.map((theme) => {
                  const avg = theme.skills.filter(
                    (s) => !s.is_not_observed && s.score !== null && s.score > 0
                  );
                  const avgScore = avg.length > 0
                    ? avg.reduce((acc, s) => acc + (s.score || 0), 0) / avg.length
                    : null;

                  return (
                    <div key={theme.theme_id} className="flex items-center gap-3">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: theme.theme_color || "#10B981" }}
                      />
                      <span className="flex-1 text-sm">{theme.theme_name}</span>
                      <span className="font-medium">{formatAverage(avgScore)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Theme accordions */}
      <div className="space-y-4">
        <h3 className="font-display font-semibold text-lg flex items-center gap-2">
          <Star className="w-5 h-5 text-emerald-500" />
          Mon débrief des compétences
        </h3>
        
        {themeScores.map((themeScore) => {
          const theme = themes.find((t) => t.id === themeScore.theme_id);
          if (!theme) return null;

          return (
            <ThemeAccordion
              key={theme.id}
              themeName={theme.name}
              themeColor={theme.color}
              skills={theme.skills}
              scores={themeScore.skills}
              objective={themeScore.objective}
              onScoreChange={(skillId, score) =>
                handleScoreChange(theme.id, skillId, score)
              }
              onNotObservedChange={(skillId, isNotObserved) =>
                handleNotObservedChange(theme.id, skillId, isNotObserved)
              }
              onCommentChange={(skillId, comment) =>
                handleCommentChange(theme.id, skillId, comment)
              }
              onObjectiveChange={(objective) =>
                handleObjectiveChange(theme.id, objective)
              }
              disabled={false}
              defaultOpen={true}
            />
          );
        })}
      </div>

      {/* Sticky Footer */}
      <div className="fixed bottom-0 left-64 right-0 bg-background/95 backdrop-blur-sm border-t border-emerald-500/30 shadow-lg z-40 max-md:left-0">
        <div className="max-w-4xl mx-auto px-4 py-3 flex gap-3 justify-end">
          <Button variant="outline" onClick={handleReset} disabled={saving}>
            <RotateCcw className="w-4 h-4 mr-2" />
            Réinitialiser
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={saving}
            className="bg-emerald-500 hover:bg-emerald-600"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Enregistrer ma perception
          </Button>
        </div>
      </div>
      {planLimitDialog}
    </div>
  );
};
