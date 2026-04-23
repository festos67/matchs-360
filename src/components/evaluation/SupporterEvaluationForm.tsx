/**
 * @component SupporterEvaluationForm
 * @description Formulaire de débrief consultatif soumis par un supporter sur
 *              invitation. Création d'une évaluation type='supporter' liée à
 *              une supporter_evaluation_request.
 * @access Supporter (via lien d'invitation, supporter_evaluation_requests)
 * @features
 *  - ThemeAccordion + StarRating standards
 *  - Pas d'objectifs ni de références (vue limitée supporter)
 *  - Mise à jour de supporter_evaluation_requests.status → completed
 *  - Affichage Badge "Débrief consultatif" pour clarifier le statut
 * @maintenance
 *  - Accès supporter limité : mem://logic/supporter-data-access
 *  - Type consultatif exclu stats : mem://logic/assessment-data-isolation-rules
 *  - Identité Heart rose (mem://style/role-branding-standard)
 */
import { useState, useEffect, useRef } from "react";
import { Save, Play, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { ThemeAccordion } from "./ThemeAccordion";
import { EvaluationRadar } from "./EvaluationRadar";
import { calculateRadarData, calculateOverallAverage, formatAverage, type ThemeScores, type SkillScore } from "@/lib/evaluation-utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { usePlanLimitHandler } from "@/hooks/usePlanLimitHandler";

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

interface SupporterEvaluationFormProps {
  playerId: string;
  playerName: string;
  teamId: string;
  frameworkId: string;
  themes: Theme[];
  requestId?: string;
  hasStarted: boolean;
  onSaved: () => void;
  onUnsavedChangesChange?: (hasUnsaved: boolean) => void;
}

export function SupporterEvaluationForm({
  playerId,
  playerName,
  teamId,
  frameworkId,
  themes,
  requestId,
  hasStarted,
  onSaved,
  onUnsavedChangesChange,
}: SupporterEvaluationFormProps) {
  const { user, profile } = useAuth();
  const [isSaving, setIsSaving] = useState(false);

  const [showConfirmSave, setShowConfirmSave] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const formSectionRef = useRef<HTMLDivElement>(null);

  // State for scores and comments
  const [scores, setScores] = useState<Record<string, number | null>>({});
  const [notObserved, setNotObserved] = useState<Record<string, boolean>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [objectives, setObjectives] = useState<Record<string, string>>({});

  // Handle score change
  const handleScoreChange = (skillId: string, score: number | null) => {
    setScores((prev) => ({ ...prev, [skillId]: score }));
    if (score !== null) {
      setNotObserved((prev) => ({ ...prev, [skillId]: false }));
    }
  };

  // Handle not observed toggle
  const handleNotObservedChange = (skillId: string, isNotObserved: boolean) => {
    setNotObserved((prev) => ({ ...prev, [skillId]: isNotObserved }));
    if (isNotObserved) {
      setScores((prev) => ({ ...prev, [skillId]: null }));
    }
  };

  // Handle comment change
  const handleCommentChange = (skillId: string, comment: string) => {
    setComments((prev) => ({ ...prev, [skillId]: comment }));
  };

  // Handle objective change
  const handleObjectiveChange = (themeId: string, objective: string) => {
    setObjectives((prev) => ({ ...prev, [themeId]: objective }));
  };

  const hasUnsavedChanges = hasStarted && !isSaved;

  // Notify parent so it can intercept Back button / navigation
  useEffect(() => {
    onUnsavedChangesChange?.(hasUnsavedChanges);
  }, [hasUnsavedChanges, onUnsavedChangesChange]);

  // Warn on tab close / refresh while a draft is in progress
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsavedChanges]);

  const handleStart = () => {
    setHasStarted(true);
    // Scroll au sommet du formulaire après rendu
    setTimeout(() => {
      formSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  // Calculate current data for radar
  const getCurrentData = (): ThemeScores[] => {
    return themes.map((theme) => ({
      theme_id: theme.id,
      theme_name: theme.name,
      theme_color: theme.color,
      skills: theme.skills.map((skill) => ({
        skill_id: skill.id,
        score: scores[skill.id] ?? null,
        is_not_observed: notObserved[skill.id] ?? false,
        comment: comments[skill.id] || null,
      })),
      objective: objectives[theme.id] || null,
    }));
  };

  // Build scores array for a specific theme
  const getThemeScores = (theme: Theme): SkillScore[] => {
    return theme.skills.map((skill) => ({
      skill_id: skill.id,
      score: scores[skill.id] ?? null,
      is_not_observed: notObserved[skill.id] ?? false,
      comment: comments[skill.id] || null,
    }));
  };

  const radarData = calculateRadarData(getCurrentData());
  const overallAverage = calculateOverallAverage(getCurrentData());

  // Save evaluation
  const performSave = async () => {
    if (!user) return;

    setIsSaving(true);
    try {
      const supporterName = profile?.nickname ||
        (profile?.first_name && profile?.last_name
          ? `${profile.first_name} ${profile.last_name}`
          : profile?.first_name || "Supporter");

      // Create evaluation
      const { data: evaluation, error: evalError } = await supabase
        .from("evaluations")
        .insert({
          player_id: playerId,
          evaluator_id: user.id,
          framework_id: frameworkId,
          name: `Débrief Supporter - ${supporterName}`,
          type: "supporter" as any,
        })
        .select()
        .single();

      if (evalError) throw evalError;

      // Insert scores
      const scoresData = themes.flatMap((theme) =>
        theme.skills.map((skill) => ({
          evaluation_id: evaluation.id,
          skill_id: skill.id,
          score: scores[skill.id] ?? null,
          is_not_observed: notObserved[skill.id] ?? false,
          comment: comments[skill.id] || null,
        }))
      );

      const { error: scoresError } = await supabase
        .from("evaluation_scores")
        .insert(scoresData);

      if (scoresError) throw scoresError;

      // Insert objectives
      const objectivesData = Object.entries(objectives)
        .filter(([, content]) => content.trim())
        .map(([themeId, content]) => ({
          evaluation_id: evaluation.id,
          theme_id: themeId,
          content: content.trim(),
        }));

      if (objectivesData.length > 0) {
        const { error: objError } = await supabase
          .from("evaluation_objectives")
          .insert(objectivesData);

        if (objError) throw objError;
      }

      // Update request status if there's a request
      if (requestId) {
        const { error: reqError } = await supabase
          .from("supporter_evaluation_requests")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
            evaluation_id: evaluation.id,
          })
          .eq("id", requestId);

        if (reqError) throw reqError;
      }

      setIsSaved(true);
      setShowConfirmSave(false);
      setShowSuccess(true);
    } catch (error: any) {
      console.error("Error saving supporter evaluation:", error);
      if (planLimitHandle(error, "supporter_evals")) {
        setIsSaving(false);
        return;
      }
      toast.error("Erreur lors de l'enregistrement");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8 pb-24">
      {/* Real-time Radar Preview */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-xl font-display font-semibold">Aperçu en temps réel</h3>
            <p className="text-sm text-muted-foreground">
              Le graphique se met à jour au fur et à mesure de votre saisie
            </p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-display font-bold text-warning">
              {formatAverage(overallAverage)}
            </p>
            <p className="text-xs text-muted-foreground">Moyenne</p>
          </div>
        </div>
        <EvaluationRadar
          data={radarData}
          primaryColor="#F97316"
          className="w-full h-[400px] sm:h-[500px] lg:h-[600px] relative"
        />
      </div>

      {/* Evaluation Form */}
      <div ref={formSectionRef} className="glass-card p-6 scroll-mt-4 relative">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-sm shrink-0">
              {playerName.slice(0, 2).toUpperCase()}
            </div>
            <h2 className="text-xl font-display font-semibold">
              Débrief de {playerName}
            </h2>
            <Badge className="bg-warning/20 text-warning border-warning/30">
              Point de vue Supporter
            </Badge>
          </div>
        </div>

        <p className="text-muted-foreground mb-6">
          Partagez votre perception des compétences du joueur. Vos observations sont
          précieuses pour compléter la vision des coachs.
        </p>

        {!hasStarted && (
          <div className="rounded-lg border-2 border-dashed border-warning/40 bg-warning/5 p-8 text-center mb-6">
            <Play className="w-10 h-10 mx-auto mb-3 text-warning" />
            <h3 className="text-lg font-display font-semibold mb-2">
              Prêt(e) à partager votre perception ?
            </h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
              Cliquez sur le bouton ci-dessous pour démarrer le débrief. Vos
              réponses ne seront enregistrées qu'après validation finale.
            </p>
            <Button
              size="lg"
              onClick={handleStart}
              className="gap-2 bg-warning hover:bg-warning/90 text-warning-foreground"
            >
              <Play className="w-4 h-4" />
              Démarrer le débrief
            </Button>
          </div>
        )}

        <div className={`space-y-4 ${!hasStarted ? "opacity-50 pointer-events-none select-none" : ""}`}>
          {themes.map((theme) => (
            <ThemeAccordion
              key={theme.id}
              themeName={theme.name}
              themeColor={theme.color}
              skills={theme.skills}
              scores={getThemeScores(theme)}
              objective={objectives[theme.id] || null}
              disabled={!hasStarted}
              onScoreChange={handleScoreChange}
              onNotObservedChange={handleNotObservedChange}
              onCommentChange={handleCommentChange}
              onObjectiveChange={(obj) => handleObjectiveChange(theme.id, obj)}
              showDefinitionInline
              showAverageAsLabel
            />
          ))}
        </div>
      </div>

      {/* Sticky Save Bar - visible only after start */}
      {hasStarted && !isSaved && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 shadow-lg">
          <div className="container mx-auto flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <p className="text-sm text-muted-foreground hidden sm:block">
              <Lock className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />
              Vos réponses sont privées : seul le coach pourra les consulter.
            </p>
            <Button
              size="lg"
              onClick={() => setShowConfirmSave(true)}
              disabled={isSaving}
              className="gap-2 bg-warning hover:bg-warning/90 text-warning-foreground ml-auto"
            >
              <Save className="w-4 h-4" />
              {isSaving ? "Enregistrement..." : "Enregistrer ma perception"}
            </Button>
          </div>
        </div>
      )}

      {/* Confirm save dialog */}
      <AlertDialog open={showConfirmSave} onOpenChange={(o) => !isSaving && setShowConfirmSave(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer l'enregistrement</AlertDialogTitle>
            <AlertDialogDescription>
              Souhaitez-vous enregistrer votre débrief sur <strong>{playerName}</strong> ?
              Une fois enregistré, vos réponses seront transmises au coach et vous
              ne pourrez plus les modifier.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>Continuer la saisie</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); performSave(); }}
              disabled={isSaving}
              className="bg-warning hover:bg-warning/90 text-warning-foreground"
            >
              {isSaving ? "Enregistrement..." : "Oui, enregistrer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Success dialog */}
      <AlertDialog open={showSuccess} onOpenChange={setShowSuccess}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-success" />
              Débrief enregistré
            </AlertDialogTitle>
            <AlertDialogDescription>
              Merci pour votre contribution ! Vos réponses ont bien été transmises.
              <br /><br />
              <strong>Confidentialité :</strong> seul le coach du joueur pourra
              consulter vos réponses. Le joueur lui-même n'y aura pas accès.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => { setShowSuccess(false); onSaved(); }}
              className="bg-warning hover:bg-warning/90 text-warning-foreground"
            >
              J'ai compris
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {planLimitDialog}
    </div>
  );
}
