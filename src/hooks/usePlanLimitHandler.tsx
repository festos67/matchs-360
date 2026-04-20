import { useState, useCallback } from "react";
import { PlanLimitAlert, type PlanLimitFeature } from "@/components/subscription/PlanLimitAlert";
import { getPlanLimitFeature, isPlanLimitError, type PlanLimitError } from "@/lib/plan-error-handler";
import { usePlan } from "@/hooks/usePlan";

/**
 * Hook that intercepts PLAN_LIMIT_* errors from Supabase triggers and shows
 * the incentive PlanLimitAlert dialog instead of a raw toast.
 *
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