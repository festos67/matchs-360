import { useNavigate } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
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

export type PlanLimitFeature =
  | "teams"
  | "players_per_team"
  | "coaches_per_team"
  | "coach_evals"
  | "self_evals"
  | "supporter_evals"
  | "supporters_per_team"
  | "player_objectives"
  | "team_objectives";

interface PlanLimitAlertProps {
  open: boolean;
  onClose: () => void;
  feature: PlanLimitFeature;
  trialDaysLeft: number | null;
}

const FEATURE_MESSAGES: Record<
  PlanLimitFeature,
  { created: string; limit: string; consequence: string }
> = {
  teams: {
    created: "Vous venez de créer votre 3ème équipe.",
    limit: "Le plan gratuit est limité à 2 équipes.",
    consequence:
      "seules vos 2 premières équipes resteront accessibles.",
  },
  players_per_team: {
    created: "Vous venez d'ajouter un 26ème joueur à cette équipe.",
    limit: "Le plan gratuit est limité à 25 joueurs par équipe.",
    consequence:
      "seuls les 25 premiers joueurs de cette équipe resteront accessibles.",
  },
  coaches_per_team: {
    created: "Vous venez d'ajouter un 2ème coach à cette équipe.",
    limit: "Le plan gratuit est limité à 1 coach référent par équipe.",
    consequence:
      "seul le coach référent restera assigné à cette équipe.",
  },
  coach_evals: {
    created: "Vous venez de créer un 4ème débrief coach pour ce joueur.",
    limit: "Le plan gratuit est limité à 3 débriefs coach par joueur.",
    consequence:
      "seuls les 3 débriefs les plus récents resteront accessibles.",
  },
  self_evals: {
    created: "Vous venez de créer un 4ème auto-débrief pour ce joueur.",
    limit: "Le plan gratuit est limité à 3 auto-débriefs par joueur.",
    consequence:
      "seuls les 3 auto-débriefs les plus récents resteront accessibles.",
  },
  supporter_evals: {
    created: "Vous venez de créer un débrief supporter supplémentaire.",
    limit: "Le plan gratuit est limité à 1 débrief supporter par joueur.",
    consequence:
      "seul le débrief supporter le plus récent restera accessible.",
  },
  supporters_per_team: {
    created: "Vous venez d'ajouter un 6ème supporter à cette équipe.",
    limit: "Le plan gratuit est limité à 5 supporters par équipe.",
    consequence:
      "seuls les 5 premiers supporters resteront accessibles.",
  },
  player_objectives: {
    created: "Vous venez de créer un 4ème objectif pour ce joueur.",
    limit: "Le plan gratuit est limité à 3 objectifs par joueur.",
    consequence:
      "seuls les 3 objectifs les plus récents resteront accessibles.",
  },
  team_objectives: {
    created: "Vous venez de créer un 4ème objectif d'équipe.",
    limit: "Le plan gratuit est limité à 3 objectifs par équipe.",
    consequence:
      "seuls les 3 objectifs les plus récents resteront accessibles.",
  },
};

export const PlanLimitAlert = ({
  open,
  onClose,
  feature,
  trialDaysLeft,
}: PlanLimitAlertProps) => {
  const navigate = useNavigate();
  const msg = FEATURE_MESSAGES[feature];

  const trialInfo =
    trialDaysLeft !== null && trialDaysLeft > 0
      ? `À la fin de votre essai Pro (dans ${trialDaysLeft} jour${trialDaysLeft > 1 ? "s" : ""})`
      : "À la fin de votre essai Pro";

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Information importante
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">{msg.created}</span>
                <br />
                {msg.limit}
              </p>
              <p>
                {trialInfo}, {msg.consequence}
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Compris</AlertDialogCancel>
          <AlertDialogAction onClick={() => navigate("/pricing")}>
            Passer en Pro — 99€/an
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};