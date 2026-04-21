/**
 * @hook usePlanLimitHandler
 * @description Hook qui intercepte les erreurs `PLAN_LIMIT_*` levées par les
 *              triggers Postgres et affiche la modale incitative PlanLimitAlert
 *              au lieu d'un toast brut. Améliore l'UX d'upgrade en cas de
 *              dépassement de quota (max_teams, max_players_per_team, etc.).
 * @returns { handleError, planLimitDialog } — handler à appeler dans catch et JSX à monter
 * @features
 *  - Détection automatique des erreurs PLAN_LIMIT_* via isPlanLimitError
 *  - Mapping erreur → feature (max_teams → "teams", max_players → "players"...)
 *  - Ouverture modale PlanLimitAlert avec CTA upgrade vers /pricing
 *  - Pass-through (return false) si erreur non liée au plan (toast standard)
 * @example
 *   const { handleError, planLimitDialog } = usePlanLimitHandler();
 *   try { ... } catch (e) { if (!handleError(e)) toast.error(...) }
 *   return <>{planLimitDialog}</>
 * @maintenance
 *  - Erreurs levées par triggers DB (not raised by client)
 *  - Voir lib/plan-error-handler.ts pour le mapping
 *  - PlanLimitAlert : composant UI (subscription/PlanLimitAlert.tsx)
 */
import { useState, useCallback } from "react";
import { PlanLimitAlert, type PlanLimitFeature } from "@/components/subscription/PlanLimitAlert";
import { getPlanLimitFeature, isPlanLimitError, type PlanLimitError } from "@/lib/plan-error-handler";
import { usePlan } from "@/hooks/usePlan";

/**
 * Usage:
 *   const { handle, dialog } = usePlanLimitHandler();
 *   ...
 *   if (handle(error, "teams")) return; // dialog shown, stop
 *   ...
 *   return <>{form}{dialog}</>;
 */
export function usePlanLimitHandler() {
  const { trialDaysLeft } = usePlan();
  const [feature, setFeature] = useState<PlanLimitFeature | null>(null);

  const handle = useCallback(
    (error: PlanLimitError | null | undefined, hint?: PlanLimitFeature): boolean => {
      if (!isPlanLimitError(error)) return false;
      const f = getPlanLimitFeature(error, hint);
      if (!f) return false;
      setFeature(f);
      return true;
    },
    [],
  );

  const dialog = feature ? (
    <PlanLimitAlert
      open={true}
      onClose={() => setFeature(null)}
      feature={feature}
      trialDaysLeft={trialDaysLeft}
    />
  ) : null;

  return { handle, dialog };
}