import { useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  TrendingUp,
  Edit,
  Trash2,
  Archive,
  ArchiveRestore,
  CheckSquare,
  Square,
  Calendar,
  Star,
  ClipboardCheck,
  User,
  Heart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { calculateOverallAverage, formatAverage, type ThemeScores } from "@/lib/evaluation-utils";

interface Evaluation {
  id: string;
  name: string;
  date: string;
  deleted_at: string | null;
  framework_id: string;
  type: "coach_assessment" | "player_self_assessment" | "supporter_assessment";
  coach: { first_name: string | null; last_name: string | null };
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
}

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

interface EvaluationHistoryProps {
  evaluations: Evaluation[];
  themes: Theme[];
  selectedEvaluation: Evaluation | null;
  comparisonIds: string[];
  teamColor: string;
  canEvaluate: boolean;
  onViewEvaluation: (evaluation: Evaluation) => void;
  onEditEvaluation: (evaluation: Evaluation) => void;
  onToggleComparison: (evalId: string) => void;
  onRefresh: () => void;
}

// Predefined colors for comparison
const COMPARISON_COLORS = [
  "#6B7280", // Gray
  "#F97316", // Orange
  "#06B6D4", // Cyan
  "#8B5CF6", // Purple
];

export function EvaluationHistory({
  evaluations,
  themes,
  selectedEvaluation,
  comparisonIds,
  teamColor,
  canEvaluate,
  onViewEvaluation,
  onEditEvaluation,
  onToggleComparison,
  onRefresh,
}: EvaluationHistoryProps) {
  const [showArchivedEvaluations, setShowArchivedEvaluations] = useState(false);

  // Separate evaluations by type
  const coachEvaluations = evaluations.filter(e => e.type === "coach_assessment");
  const selfEvaluations = evaluations.filter(e => e.type === "player_self_assessment");
  const supporterEvaluations = evaluations.filter(e => e.type === "supporter_assessment");
  
  const filteredCoachEvals = showArchivedEvaluations 
    ? coachEvaluations 
    : coachEvaluations.filter(e => !e.deleted_at);
  const filteredSelfEvals = showArchivedEvaluations 
    ? selfEvaluations 
    : selfEvaluations.filter(e => !e.deleted_at);
  const filteredSupporterEvals = showArchivedEvaluations 
    ? supporterEvaluations 
    : supporterEvaluations.filter(e => !e.deleted_at);

  const activeCoachEvaluations = coachEvaluations.filter(e => !e.deleted_at);

  const getEvaluationScore = (evaluation: Evaluation) => {
    const themeScores: ThemeScores[] = themes.map(theme => ({
      theme_id: theme.id,
      theme_name: theme.name,
      theme_color: theme.color,
      skills: theme.skills.map(skill => {
        const score = evaluation.scores.find(s => s.skill_id === skill.id);
        return {
          skill_id: skill.id,
          score: score?.score ?? null,
          is_not_observed: score?.is_not_observed ?? false,
          comment: null,
        };
      }),
      objective: null,
    }));
    return formatAverage(calculateOverallAverage(themeScores));
  };

  const handleDeleteEvaluation = async (evaluationId: string) => {
    try {
      const { error } = await supabase
        .from("evaluations")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", evaluationId);
      
      if (error) throw error;
      
      toast.success("Débrief supprimé");
      onRefresh();
    } catch (error: unknown) {
      console.error("Error deleting evaluation:", error);
      toast.error("Erreur lors de la suppression");
    }
  };

  const handleRestoreEvaluation = async (evaluationId: string) => {
    try {
      const { error } = await supabase
        .from("evaluations")
        .update({ deleted_at: null })
        .eq("id", evaluationId);
      
      if (error) throw error;
      
      toast.success("Débrief restauré");
      onRefresh();
    } catch (error: unknown) {
      console.error("Error restoring evaluation:", error);
      toast.error("Erreur lors de la restauration");
    }
  };

  const renderEvaluationItem = (
    evaluation: Evaluation,
    isCoachType: boolean
  ) => {
    const isSelected = selectedEvaluation?.id === evaluation.id;
    const isCompared = comparisonIds.includes(evaluation.id);
    const isCurrent = isCoachType && activeCoachEvaluations[0]?.id === evaluation.id;
    const isArchived = !!evaluation.deleted_at;

    return (
      <div
        key={evaluation.id}
        className={`flex items-center gap-4 p-4 rounded-lg transition-colors ${
          isArchived
            ? "bg-destructive/5 border border-destructive/20 opacity-70"
            : isSelected
            ? "bg-primary/10 border border-primary/30"
            : isCompared
            ? "bg-warning/10 border border-warning/30"
            : "bg-muted/30 hover:bg-muted/50"
        }`}
      >
        {/* Comparison checkbox - only for coach evaluations */}
        {isCoachType && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (!isArchived) onToggleComparison(evaluation.id);
            }}
            className="shrink-0"
            disabled={isSelected || isArchived}
          >
            {isCompared ? (
              <CheckSquare className="w-5 h-5 text-warning" />
            ) : isArchived ? (
              <Archive className="w-5 h-5 text-destructive/50" />
            ) : (
              <Square className={`w-5 h-5 ${isSelected ? "text-muted-foreground/30" : "text-muted-foreground hover:text-foreground"}`} />
            )}
          </button>
        )}

        <div
          className="flex-1 flex items-center gap-4 cursor-pointer"
          onClick={() => onViewEvaluation(evaluation)}
        >
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{
              backgroundColor: isCompared
                ? COMPARISON_COLORS[comparisonIds.indexOf(evaluation.id) % COMPARISON_COLORS.length] + "20"
                : isSelected
                ? `${teamColor}20`
                : isCoachType ? "hsl(var(--primary) / 0.2)" : "hsl(37.7 92.1% 50.2% / 0.2)",
            }}
          >
            {isCoachType ? (
              <TrendingUp
                className="w-6 h-6"
                style={{
                  color: isCompared
                    ? COMPARISON_COLORS[comparisonIds.indexOf(evaluation.id) % COMPARISON_COLORS.length]
                    : "hsl(var(--primary))",
                }}
              />
            ) : (
              <Star className="w-6 h-6 text-amber-500" />
            )}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className={`font-medium ${isArchived ? "line-through text-muted-foreground" : ""}`}>
                {evaluation.name}
              </p>
              {isArchived && (
                <Badge variant="destructive" className="text-xs">Archivée</Badge>
              )}
              {isCurrent && !isArchived && (
                <Badge variant="secondary" className="text-xs">Actuelle</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {isCoachType 
                ? `Par ${evaluation.coach?.first_name} ${evaluation.coach?.last_name} • `
                : ""}
              {format(new Date(evaluation.date), "d MMMM yyyy", { locale: fr })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="font-display font-bold text-lg">{getEvaluationScore(evaluation)}</p>
            <p className="text-xs text-muted-foreground">/5</p>
          </div>
          {canEvaluate && !isArchived && isCoachType && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  onEditEvaluation(evaluation);
                }}
              >
                <Edit className="w-4 h-4 mr-1" />
                Modifier
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:bg-destructive/10"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Supprimer ce débrief ?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Le débrief "{evaluation.name}" sera archivé et n'apparaîtra plus dans l'historique. Cette action peut être annulée par un administrateur.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => handleDeleteEvaluation(evaluation.id)}
                    >
                      Supprimer
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
          {canEvaluate && isArchived && (
            <Button
              size="sm"
              variant="outline"
              className="gap-2 text-success border-success/30 hover:bg-success/10"
              onClick={(e) => {
                e.stopPropagation();
                handleRestoreEvaluation(evaluation.id);
              }}
            >
              <ArchiveRestore className="w-4 h-4" />
              Restaurer
            </Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-display font-semibold">Historique des débriefs</h2>
        <div className="flex items-center gap-4">
          {canEvaluate && evaluations.some(e => e.deleted_at) && (
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={showArchivedEvaluations}
                onChange={(e) => setShowArchivedEvaluations(e.target.checked)}
                className="rounded border-muted-foreground/30"
              />
              <Archive className="w-4 h-4" />
              Afficher les archivées
            </label>
          )}
          {comparisonIds.length > 0 && (
            <Badge variant="secondary" className="gap-2">
              <Calendar className="w-3 h-3" />
              {comparisonIds.length} sélectionnée(s) pour comparaison
            </Badge>
          )}
        </div>
      </div>

      {/* Section A: Coach Evaluations (Official) */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center gap-2 text-primary">
            <ClipboardCheck className="w-5 h-5" />
            <h3 className="font-semibold text-lg">Suivi Officiel (Coach)</h3>
          </div>
          <Badge variant="outline" className="text-xs">
            {filteredCoachEvals.length} débrief{filteredCoachEvals.length > 1 ? "s" : ""}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Débriefs validés par les coachs — Référence officielle pour le club
        </p>
        
        {filteredCoachEvals.length > 0 ? (
          <div className="space-y-3">
            {filteredCoachEvals.map((evaluation) => renderEvaluationItem(evaluation, true))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground bg-muted/20 rounded-lg">
            <TrendingUp className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p>Aucun débrief officiel {showArchivedEvaluations ? "" : "actif"}</p>
          </div>
        )}
      </div>

      <Separator className="my-6" />

      {/* Section B: Self Evaluations */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center gap-2 text-amber-500">
            <User className="w-5 h-5" />
            <h3 className="font-semibold text-lg">Auto-débriefs (Joueur)</h3>
          </div>
          <Badge className="text-xs bg-amber-500/20 text-amber-600 border-amber-500/30">
            {filteredSelfEvals.length} auto-débrief{filteredSelfEvals.length > 1 ? "s" : ""}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Perception personnelle du joueur — Données consultatives uniquement
        </p>
        
        {filteredSelfEvals.length > 0 ? (
          <div className="space-y-3">
            {filteredSelfEvals.map((evaluation) => renderEvaluationItem(evaluation, false))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground bg-amber-500/5 rounded-lg border border-amber-500/10">
            <Star className="w-10 h-10 mx-auto mb-2 opacity-50 text-amber-500" />
            <p>Aucun auto-débrief {showArchivedEvaluations ? "" : "disponible"}</p>
          </div>
        )}
      </div>

      <Separator className="my-6" />

      {/* Section C: Supporter Evaluations */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center gap-2 text-orange-500">
            <Heart className="w-5 h-5" />
            <h3 className="font-semibold text-lg">Débriefs Supporters</h3>
          </div>
          <Badge className="text-xs bg-orange-500/20 text-orange-600 border-orange-500/30">
            {filteredSupporterEvals.length} débrief{filteredSupporterEvals.length > 1 ? "s" : ""}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Perception des proches (parents) — Données consultatives uniquement
        </p>
        
        {filteredSupporterEvals.length > 0 ? (
          <div className="space-y-3">
            {filteredSupporterEvals.map((evaluation) => renderEvaluationItem(evaluation, false))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground bg-orange-500/5 rounded-lg border border-orange-500/10">
            <Heart className="w-10 h-10 mx-auto mb-2 opacity-50 text-orange-500" />
            <p>Aucun débrief supporter {showArchivedEvaluations ? "" : "disponible"}</p>
          </div>
        )}
      </div>

      {/* Comparison tip */}
      {activeCoachEvaluations.length > 1 && (
        <div className="mt-6 p-4 bg-muted/30 rounded-lg">
          <p className="text-sm text-muted-foreground">
            💡 <strong>Astuce:</strong> Cochez les débriefs officiels que vous souhaitez comparer, puis allez dans l'onglet "Vue Radar" pour visualiser la superposition des graphiques.
          </p>
        </div>
      )}
    </div>
  );
}
