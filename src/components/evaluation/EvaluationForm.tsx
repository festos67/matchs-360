import { useState, useEffect, useMemo, forwardRef, useImperativeHandle, useRef } from "react";
import { Save, RotateCcw, FileText, Calendar, Loader2 } from "lucide-react";
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
  type SkillScore,
} from "@/lib/evaluation-utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

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

interface EvaluationFormProps {
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
  previousEvaluation?: {
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
  };
  previousScores?: Record<string, number | null>;
  onSaved?: () => void;
  readOnly?: boolean;
}

export interface EvaluationFormHandle {
  save: () => Promise<void>;
  hasChanges: () => boolean;
}

export const EvaluationForm = forwardRef<EvaluationFormHandle, EvaluationFormProps>(({
  playerId,
  playerName,
  teamId,
  frameworkId,
  themes,
  existingEvaluation,
  previousEvaluation,
  previousScores,
  onSaved,
  readOnly = false,
}, ref) => {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [hasBeenModified, setHasBeenModified] = useState(false);
  const [evaluationName, setEvaluationName] = useState(
    existingEvaluation?.name || `MATCHS360-${playerName}-${new Date().toLocaleDateString("fr-FR")}`
  );

  // Initialize scores state
  const [themeScores, setThemeScores] = useState<ThemeScores[]>(() => {
    // For existing evaluations: load their scores
    // For new evaluations: scores at null, but carry over comments & objectives from previous
    const sourceEval = existingEvaluation || null;
    const commentSource = existingEvaluation ? existingEvaluation : previousEvaluation;
    
    return themes.map((theme) => ({
      theme_id: theme.id,
      theme_name: theme.name,
      theme_color: theme.color,
      skills: theme.skills.map((skill) => {
        const existingScore = sourceEval?.scores.find(
          (s) => s.skill_id === skill.id
        );
        const prevComment = commentSource?.scores.find(
          (s) => s.skill_id === skill.id
        );
        return {
          skill_id: skill.id,
          score: existingScore?.score ?? null,
          is_not_observed: existingScore?.is_not_observed ?? false,
          comment: prevComment?.comment ?? null,
        };
      }),
      objective: (existingEvaluation || previousEvaluation)?.objectives.find(
        (o) => o.theme_id === theme.id
      )?.content ?? null,
    }));
  });

  // Expose save and hasChanges to parent via ref
  useImperativeHandle(ref, () => ({
    save: handleSave,
    hasChanges: () => hasBeenModified,
  }));

  // Calculate radar data in real-time
  const radarData = useMemo(() => calculateRadarData(themeScores), [themeScores]);
  const overallAverage = useMemo(() => calculateOverallAverage(themeScores), [themeScores]);

  // Update handlers - track modifications
  const handleScoreChange = (themeId: string, skillId: string, score: number) => {
    setHasBeenModified(true);
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
          score: null,
          is_not_observed: false,
          comment: null,
        })),
        objective: null,
      }))
    );
  };

  const generateUniqueName = async (baseName: string): Promise<string> => {
    // Check if an evaluation with this name already exists for this player
    const { data: existingEvaluations } = await supabase
      .from("evaluations")
      .select("name")
      .eq("player_id", playerId)
      .ilike("name", `${baseName}%`);

    if (!existingEvaluations || existingEvaluations.length === 0) {
      return baseName;
    }

    // Check if the exact name exists
    const exactMatch = existingEvaluations.some(e => e.name === baseName);
    if (!exactMatch) {
      return baseName;
    }

    // Generate unique name with number, date and time (for same-day evaluations)
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
        // Update existing evaluation
        await supabase
          .from("evaluations")
          .update({
            name: evaluationName,
            date: new Date().toISOString(),
          })
          .eq("id", evaluationId);
      } else {
        // Generate unique name if needed
        const uniqueName = await generateUniqueName(evaluationName);

        // Create new evaluation
        const { data: newEval, error } = await supabase
          .from("evaluations")
          .insert({
            player_id: playerId,
            coach_id: user.id,
            framework_id: frameworkId,
            name: uniqueName,
            type: "coach_assessment",
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
      await supabase
        .from("evaluation_scores")
        .delete()
        .eq("evaluation_id", evaluationId);

      if (scoresToUpsert.length > 0) {
        const { error: scoresError } = await supabase
          .from("evaluation_scores")
          .insert(scoresToUpsert);

        if (scoresError) throw scoresError;
      }

      // Upsert objectives
      await supabase
        .from("evaluation_objectives")
        .delete()
        .eq("evaluation_id", evaluationId);

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

      toast.success("Débrief enregistré avec succès");
      onSaved?.();
    } catch (error: any) {
      console.error("Error saving evaluation:", error);
      toast.error("Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Header with radar and summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Radar Chart */}
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-display font-semibold text-lg">Vue Radar</h3>
              <p className="text-sm text-muted-foreground">Mise à jour en temps réel</p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-display font-bold text-primary">
                {formatAverage(overallAverage)}
              </p>
              <p className="text-sm text-muted-foreground">Moyenne globale</p>
            </div>
          </div>
          <EvaluationRadar data={radarData} />
        </div>

        {/* Evaluation info */}
        <div className="glass-card p-6">
          <h3 className="font-display font-semibold text-lg mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Informations
          </h3>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="evaluationName">Titre du débrief</Label>
              <Input
                id="evaluationName"
                value={evaluationName}
                onChange={(e) => setEvaluationName(e.target.value)}
                placeholder="Titre du débrief..."
                disabled={readOnly}
              />
            </div>

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="w-4 h-4" />
              <span>
                {existingEvaluation
                  ? `Dernière modification: ${new Date(existingEvaluation.date).toLocaleDateString("fr-FR")}`
                  : `Nouveau débrief - ${new Date().toLocaleDateString("fr-FR")}`}
              </span>
            </div>

            {/* Score summary */}
            <div className="pt-4 border-t border-border">
              <h4 className="text-sm font-medium mb-3">Résumé par thématique</h4>
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
                        style={{ backgroundColor: theme.theme_color || "#3B82F6" }}
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
        <h3 className="font-display font-semibold text-lg">Débrief des compétences</h3>
        
        {themeScores.map((themeScore) => {
          const theme = themes.find((t) => t.id === themeScore.theme_id);
          if (!theme) return null;

          const themePreviousScores: Record<string, number | null> = {};
          if (previousScores) {
            theme.skills.forEach(skill => {
              if (previousScores[skill.id] !== undefined) {
                themePreviousScores[skill.id] = previousScores[skill.id];
              }
            });
          }

          return (
            <ThemeAccordion
              key={theme.id}
              themeName={theme.name}
              themeColor={theme.color}
              skills={theme.skills}
              scores={themeScore.skills}
              previousScores={previousScores ? themePreviousScores : undefined}
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
              disabled={readOnly}
              defaultOpen={true}
            />
          );
        })}
      </div>

      {/* Sticky Footer */}
      {!readOnly && (
        <div className="fixed bottom-0 left-64 right-0 bg-background/95 backdrop-blur-sm border-t border-border shadow-lg z-40 max-md:left-0">
          <div className="max-w-4xl mx-auto px-4 py-3 flex gap-3 justify-end">
            <Button variant="outline" onClick={handleReset} disabled={saving}>
              <RotateCcw className="w-4 h-4 mr-2" />
              Réinitialiser
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Enregistrer
            </Button>
          </div>
        </div>
      )}
    </div>
  );
});

EvaluationForm.displayName = "EvaluationForm";