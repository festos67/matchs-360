/**
 * @component PlayerHistoryTab
 * @description Wrapper léger de l'onglet "Historique" (renommé "Évolution" pour
 *              les joueurs) sur la fiche joueur. Délègue l'affichage complet à
 *              EvaluationHistory.
 * @access Tous rôles avec accès à la fiche joueur
 * @features
 *  - Pass-through des évaluations + thèmes vers EvaluationHistory
 *  - Gestion sélection courante et IDs de comparaison
 * @maintenance
 *  - Renommage "Évolution" pour joueur : mem://features/player/interface-restrictions
 *  - Logique complète : voir EvaluationHistory.tsx
 */
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
  hideSupporterSection?: boolean;
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
      hideSupporterSection={props.hideSupporterSection}
    />
  );
}
