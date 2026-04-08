import { useState } from "react";
import { Star, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeAccordion } from "./ThemeAccordion";
import { EvaluationRadar } from "./EvaluationRadar";
import { calculateRadarData, calculateOverallAverage, formatAverage, type ThemeScores, type SkillScore } from "@/lib/evaluation-utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
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

interface SupporterEvaluationFormProps {
  playerId: string;
  playerName: string;
  teamId: string;
  frameworkId: string;
  themes: Theme[];
  requestId?: string;
  onSaved: () => void;
}

export function SupporterEvaluationForm({
  playerId,
  playerName,
  teamId,
  frameworkId,
  themes,
  requestId,
  onSaved,
}: SupporterEvaluationFormProps) {
  const { user, profile } = useAuth();
  const [isSaving, setIsSaving] = useState(false);

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
  const handleSave = async () => {
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
          type: "supporter_assessment" as any,
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

      toast.success("Débrief enregistré avec succès !");
      onSaved();
    } catch (error: any) {
      console.error("Error saving supporter evaluation:", error);
      toast.error("Erreur lors de l'enregistrement");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Real-time Radar Preview */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-display font-semibold">Aperçu en temps réel</h3>
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
        <EvaluationRadar data={radarData} primaryColor="#F97316" />
      </div>

      {/* Evaluation Form */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Star className="w-5 h-5 text-warning" />
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

        <div className="space-y-4">
          {themes.map((theme) => (
            <ThemeAccordion
              key={theme.id}
              themeName={theme.name}
              themeColor={theme.color}
              skills={theme.skills}
              scores={getThemeScores(theme)}
              objective={objectives[theme.id] || null}
              disabled={false}
              onScoreChange={handleScoreChange}
              onNotObservedChange={handleNotObservedChange}
              onCommentChange={handleCommentChange}
              onObjectiveChange={(obj) => handleObjectiveChange(theme.id, obj)}
            />
          ))}
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end gap-4">
        <Button
          size="lg"
          onClick={handleSave}
          disabled={isSaving}
          className="gap-2 bg-warning hover:bg-warning/90 text-warning-foreground"
        >
          <Save className="w-4 h-4" />
          {isSaving ? "Enregistrement..." : "Enregistrer ma perception"}
        </Button>
      </div>
    </div>
  );
}
