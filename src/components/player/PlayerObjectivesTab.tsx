import { PlayerObjectivesList } from "@/components/objectives/PlayerObjectivesList";

interface PlayerObjectivesTabProps {
  playerId: string;
  teamId: string;
  canEdit: boolean;
}

export function PlayerObjectivesTab({ playerId, teamId, canEdit }: PlayerObjectivesTabProps) {
  return <PlayerObjectivesList playerId={playerId} teamId={teamId} canEdit={canEdit} />;
}
