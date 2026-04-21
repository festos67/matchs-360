/**
 * @component PlayerObjectivesTab
 * @description Wrapper de l'onglet "Objectifs" sur la fiche joueur. Délègue à
 *              PlayerObjectivesList qui gère drag-drop, attachements, statuts.
 * @access Coachs (édition), Responsable Club (édition), Joueur (lecture seule),
 *         Coach Assistant (lecture seule)
 * @features
 *  - Pass-through playerId + teamId + canEdit
 *  - Aucune logique propre (composant pont)
 * @maintenance
 *  - Logique complète : mem://features/player-objectives
 *  - Coach Assistant en lecture seule (mem://features/coach-team-workflow)
 */
import { PlayerObjectivesList } from "@/components/objectives/PlayerObjectivesList";

interface PlayerObjectivesTabProps {
  playerId: string;
  teamId: string;
  canEdit: boolean;
}

export function PlayerObjectivesTab({ playerId, teamId, canEdit }: PlayerObjectivesTabProps) {
  return <PlayerObjectivesList playerId={playerId} teamId={teamId} canEdit={canEdit} />;
}
