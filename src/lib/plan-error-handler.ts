import type { PlanLimitFeature } from "@/components/subscription/PlanLimitAlert";

/**
 * Helpers pour identifier et router les erreurs Supabase dont le message
 * commence par "PLAN_LIMIT_" (levées par les triggers Postgres).
 * L'affichage UX est délégué au hook `usePlanLimitHandler` qui ouvre la
 * modale incentive `PlanLimitAlert`.
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