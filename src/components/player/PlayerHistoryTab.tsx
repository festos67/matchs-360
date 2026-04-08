import { EvaluationHistory } from "@/components/player/EvaluationHistory";
import type { Evaluation, Theme } from "@/hooks/usePlayerData";

interface PlayerHistoryTabProps {
  evaluations: Evaluation[];
  themes: Theme[];
  selectedEvaluation: Evaluation | null;
  comparisonIds: string[];
  teamColor: string;
  canEvaluate: boolean;
  currentFrameworkId: string | null;
  onViewEvaluation: (evaluation: Evaluation) => void;
  onEditEvaluation: (evaluation: Evaluation) => void;
  onToggleComparison: (evalId: string) => void;
  onRefresh: () => void;
  onPrintEvaluation: (evaluation: Evaluation) => void;
}

export function PlayerHistoryTab(props: PlayerHistoryTabProps) {
  return (
    <EvaluationHistory
      evaluations={props.evaluations}
      themes={props.themes}
      selectedEvaluation={props.selectedEvaluation}
      comparisonIds={props.comparisonIds}
      teamColor={props.teamColor}
      canEvaluate={props.canEvaluate}
      currentFrameworkId={props.currentFrameworkId}
      onViewEvaluation={props.onViewEvaluation}
      onEditEvaluation={props.onEditEvaluation}
      onToggleComparison={props.onToggleComparison}
      onRefresh={props.onRefresh}
      onPrintEvaluation={props.onPrintEvaluation}
    />
  );
}
