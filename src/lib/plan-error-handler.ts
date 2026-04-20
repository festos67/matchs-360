import { toast } from "sonner";
import type { PlanLimitFeature } from "@/components/subscription/PlanLimitAlert";

/**
 * Intercepte les erreurs Supabase dont le message commence par "PLAN_LIMIT_"
 * (levées par les triggers Postgres) et affiche un toast de conversion
 * Pro adapté au lieu d'un toast d'erreur générique.
 *
 * Usage :
 *   const { error } = await supabase.from("teams").insert({...});
 *   if (error) {
 *     if (handlePlanLimitError(error)) return; // toast Pro affiché, stop
 *     toast.error("Erreur", { description: error.message });
 *   }
 */

export interface PlanLimitError {
  message?: string;
}

export function isPlanLimitError(error: PlanLimitError | null | undefined): boolean {
  return !!error?.message && error.message.includes("PLAN_LIMIT_");
}

export function parsePlanLimitError(error: PlanLimitError): {
  type: string;
  message: string;
} {
  const msg = error.message || "";
  const match = msg.match(/PLAN_LIMIT_(\w+):(.*)/);
  if (!match) return { type: "UNKNOWN", message: msg };
  return { type: match[1], message: match[2].trim() };
}

/**
 * Maps a PLAN_LIMIT_* SQL code to a PlanLimitAlert feature key.
 * For ambiguous codes (OBJ → player vs team objectives, EVALS → coach/self/supporter),
 * pass a `hint` to disambiguate.
 */
export function getPlanLimitFeature(
  error: PlanLimitError | null | undefined,
  hint?: PlanLimitFeature,
): PlanLimitFeature | null {
  if (!isPlanLimitError(error)) return null;
  const { type } = parsePlanLimitError(error as PlanLimitError);
  switch (type) {
    case "TEAMS":
      return "teams";
    case "PLAYERS":
      return "players_per_team";
    case "COACHES":
      return "coaches_per_team";
    case "SUPPORTERS":
      return "supporters_per_team";
    case "OBJ":
      return hint === "team_objectives" ? "team_objectives" : "player_objectives";
    case "EVALS":
      return hint ?? "coach_evals";
    default:
      return hint ?? null;
  }
}

const FRIENDLY_TITLES: Record<string, string> = {
  TEAMS: "Limite d'équipes atteinte",
  PLAYERS: "Limite de joueurs atteinte",
  COACHES: "Limite de coachs atteinte",
  EVALS: "Limite de débriefs atteinte",
  OBJ: "Limite d'objectifs atteinte",
  UNKNOWN: "Limite du plan gratuit atteinte",
};

/**
 * Returns true if the error was a PLAN_LIMIT error and was handled
 * (toast with "Passer en Pro" action shown). Callers should early-return.
 */
export function handlePlanLimitError(
  error: PlanLimitError | null | undefined,
): boolean {
  if (!isPlanLimitError(error)) return false;
  const { type, message } = parsePlanLimitError(error as PlanLimitError);
  const title = FRIENDLY_TITLES[type] || FRIENDLY_TITLES.UNKNOWN;

  toast.error(title, {
    description: message || "Passez en Pro pour débloquer plus.",
    duration: 8000,
    action: {
      label: "Passer en Pro",
      onClick: () => {
        window.location.href = "/pricing";
      },
    },
  });
  return true;
}