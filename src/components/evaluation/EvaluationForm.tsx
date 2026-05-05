/**
 * @component EvaluationForm
 * @description Formulaire principal de débrief coach (officiel). Composant central
 *              affichant accordéons par thème, StarRating, commentaires, objectifs
 *              et radar live. Gère brouillons, références score précédent, reset.
 * @access Coach assigné, Coach Référent, Responsable Club, Super Admin
 * @features
 *  - ThemeAccordion par thème avec ouverture par défaut (UX standards)
 *  - StarRating 0-5 + bouton "Non observé" (exclu des moyennes)
 *  - Référence au score précédent via icône History
 *  - Sticky footer (Save, Reset, Cancel) — UX standard
 *  - Système brouillons (draft) : intercepte sortie sans save, reprise auto
 *  - Distinction Reset (clear all) vs New (clear scores only via newEvalKey)
 *  - AlertDialog de confirmation Reset avec bouton Cancel emphasisé
 *  - Verrouillage lecture seule si historique passé ou coach non assigné
 *  - forwardRef + useImperativeHandle pour exposer méthodes parent
 * @maintenance
 *  - Calculs scores : mem://logic/evaluation/calculations-logic
 *  - Reset vs New : mem://logic/evaluation/reset-vs-new-behavior
 *  - Brouillons : mem://features/evaluation-draft-system
 *  - Permissions édition : mem://logic/debrief-editing-permissions
 *  - Score précédent : mem://features/debrief-previous-score-reference
 *  - Sécurité reset : mem://logic/evaluation-reset-safety
 */
import { useState, useEffect, useMemo, forwardRef, useImperativeHandle, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Save, RotateCcw, FileText, Calendar, Loader2, AlertTriangle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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

interface EvaluationFormProps {
  playerId: string;
  playerName: string;
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
  onSaved?: (savedEvaluationId: string) => void | Promise<void>;
  readOnly?: boolean;
  coachName?: string;
  evaluationNumber?: number;
  /** Affiche un bandeau d'avertissement quand on édite un débrief historique. */
  historyEditWarning?: boolean;
}

export interface EvaluationFormHandle {
  save: () => Promise<void>;
  hasChanges: () => boolean;
}

export const EvaluationForm = forwardRef<EvaluationFormHandle, EvaluationFormProps>(({
  playerId,
  playerName,
  frameworkId,
  themes,
  existingEvaluation,
  previousEvaluation,
  previousScores,
  onSaved,
  readOnly = false,
  coachName,
  evaluationNumber,
  historyEditWarning = false,
}, ref) => {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  // Synchronous guard to block rapid double-submits before React re-renders
  const savingRef = useRef(false);
  const [hasBeenModified, setHasBeenModified] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const { handle: planLimitHandle, dialog: planLimitDialog } = usePlanLimitHandler();
  
  const generateDefaultName = () => {
    const now = new Date();
    const dateStr = now.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
    const timeStr = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    const num = evaluationNumber ?? "–";
    const coach = coachName || "";
    return `Débrief N°${num} – ${playerName} – ${coach} – ${dateStr} ${timeStr}`;
  };
  
  const [evaluationName, setEvaluationName] = useState(
    existingEvaluation?.name || generateDefaultName()
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
    setHasBeenModified(true);
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
    setHasBeenModified(true);
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
    setHasBeenModified(true);
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

  // Build a disambiguated name (date + time + counter) — used on UNIQUE conflict (23505)
  const buildDisambiguatedName = (baseName: string, attempt: number): string => {
    const now = new Date();
    const today = now.toLocaleDateString("fr-FR");
    const time = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    return `${baseName} #${attempt} - ${today} ${time}`;
  };

  // Insert evaluation with retry on UNIQUE name conflict (23505 on evaluations_unique_name_per_player_idx).
  // No pre-flight ilike() query: relies on DB constraint to avoid race conditions.
  const insertEvaluationWithUniqueName = async (
    baseName: string,
  ): Promise<{ id: string }> => {
    const MAX_ATTEMPTS = 8;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const candidateName = attempt === 1 ? baseName : buildDisambiguatedName(baseName, attempt);
      const { data, error } = await supabase
        .from("evaluations")
        .insert({
          player_id: playerId,
          evaluator_id: user!.id,
          framework_id: frameworkId,
          name: candidateName,
          type: "coach",
        })
        .select("id")
        .single();
      if (!error && data) return { id: data.id };
      // 23505 on the name index → retry with disambiguated name
      // 23505 on the per-day index → bubble up (handled by caller)
      const isNameConflict =
        error?.code === "23505" &&
        typeof error.message === "string" &&
        error.message.includes("evaluations_unique_name_per_player_idx");
      if (!isNameConflict) throw error;
    }
    throw new Error("Impossible de générer un nom unique pour ce débrief");
  };

  const handleSave = async () => {
    if (!user) {
      toast.error("Vous devez être connecté");
      return;
    }

    // Block rapid double-clicks: ref check is synchronous, setSaving is not
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      let evaluationId = existingEvaluation?.id;

      if (evaluationId) {
        // Update existing evaluation
        const { error: updateErr } = await supabase
          .from("evaluations")
          .update({
            name: evaluationName,
            // Store calendar date only (YYYY-MM-DD), no timezone
            date: new Date().toISOString().slice(0, 10),
          })
          .eq("id", evaluationId);

        if (updateErr) throw updateErr;
      } else {
        // Insert with DB-enforced unique name (retry on conflict)
        const newEval = await insertEvaluationWithUniqueName(evaluationName);
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

      if (!evaluationId) throw new Error("Débrief introuvable après sauvegarde");
      await onSaved?.(evaluationId);
      toast.success("Débrief enregistré avec succès");
      // Scroll back to top after save (radar view)
      document.querySelector("main")?.scrollTo({ top: 0, behavior: "smooth" });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error: any) {
      console.error("Error saving evaluation:", error);
      if (planLimitHandle(error, "coach_evals")) {
        setSaving(false);
        return;
      }
      // 23505 = unique_violation (evaluations_unique_per_day_idx)
      if (error?.code === "23505") {
        toast.error("Un débrief existe déjà pour ce joueur aujourd'hui", {
          description: "Ouvrez le débrief existant pour le modifier.",
        });
      } else {
        toast.error("Erreur lors de la sauvegarde");
      }
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Bandeau persistant : édition d'un débrief historique */}
      {historyEditWarning && !readOnly && (
        <div className="p-3 bg-amber-500/15 border-l-4 border-amber-500 rounded-r flex items-start gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-amber-700 dark:text-amber-400">
              Modification d'un débrief historique
            </p>
            <p className="text-muted-foreground mt-1">
              Vos changements remplaceront les valeurs actuelles. L'opération est tracée
              dans l'audit log (visible côté super-admin).
            </p>
          </div>
        </div>
      )}

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
        <h3 id="skills-section" className="font-display font-semibold text-lg scroll-mt-20">Débrief des compétences</h3>
        
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
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" disabled={saving}>
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Réinitialiser
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Réinitialiser le débrief</AlertDialogTitle>
                  <AlertDialogDescription>
                    Toutes les notes et commentaires saisis seront effacés. Cette action est irréversible.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogAction onClick={handleReset} className="bg-muted text-muted-foreground hover:bg-muted/80 border border-border">
                    Réinitialiser
                  </AlertDialogAction>
                  <AlertDialogCancel className="bg-primary text-primary-foreground hover:bg-primary/90 border-0">
                    Annuler
                  </AlertDialogCancel>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button onClick={() => { setEvaluationName(existingEvaluation?.name || generateDefaultName()); setShowSaveDialog(true); }} disabled={saving}>
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

      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enregistrer le débrief</DialogTitle>
            <DialogDescription>
              Confirmez ou modifiez le nom du débrief avant de sauvegarder.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="eval-name">Nom du débrief</Label>
            <Input
              id="eval-name"
              value={evaluationName}
              onChange={(e) => setEvaluationName(e.target.value)}
              className="mt-2"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
              Annuler
            </Button>
            <Button onClick={() => { setShowSaveDialog(false); handleSave(); }} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Confirmer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {planLimitDialog}
    </div>
  );
});

EvaluationForm.displayName = "EvaluationForm";