/**
 * @hook usePlan
 * @description Hook fournissant le statut d'abonnement du club courant : plan
 *              actif (free/pro), période d'essai, dates de fin, et les limites
 *              applicables (max joueurs, max coachs, fonctionnalités premium).
 * @returns { planStatus, loading } — PlanStatus = { plan, limits, subscription, isTrialActive, daysLeftInTrial }
 * @features
 *  - Récupération en cascade : profile → club_id → subscriptions actives
 *  - Lecture des limites via plan_limits (table de référence par plan)
 *  - Détection trial actif (is_trial=true + ends_at > now)
 *  - Calcul jours restants pour TrialBanner
 *  - Cache local pour éviter requêtes répétées
 * @maintenance
 *  - Limites consommées par usePlanLimitHandler (intercepte erreurs PLAN_LIMIT_*)
 *  - Banner d'essai : src/components/subscription/TrialBanner.tsx
 *  - Gestion limites : appliquée par triggers Postgres côté DB
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import type { PlanStatus, PlanLimits, Subscription, SubscriptionPlan } from "@/types/subscription";

export function usePlan() {
  const { profile, hasAdminRole } = useAuth();
  const clubId = profile?.club_id ?? null;
  const enabled = hasAdminRole || !!clubId;

  const { data: planStatus, isLoading } = useQuery({
    // Clé stable → tous les composants partagent le MÊME fetch (dédup)
    queryKey: ["plan", hasAdminRole ? "admin" : (clubId ?? "none")],
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<PlanStatus> => {
      // Super admin : Pro en UI
      if (hasAdminRole) {
        const { data: limits } = await supabase
          .from("plan_limits").select("*").eq("plan", "pro").single();
        return {
          plan: "pro", limits: limits as PlanLimits, subscription: null,
          isTrial: false, trialDaysLeft: null, seasonEnd: "",
          isProration: false, prorataAmount: null,
        };
      }
      const today = new Date().toISOString().split("T")[0];
      const { data: sub } = await supabase
        .from("subscriptions").select("*")
        .eq("club_id", clubId!)
        .gte("ends_at", today).lte("starts_at", today)
        .order("plan", { ascending: false })
        .limit(1).maybeSingle();
      const currentPlan: SubscriptionPlan = (sub?.plan as SubscriptionPlan) || "free";
      const { data: limits } = await supabase
        .from("plan_limits").select("*").eq("plan", currentPlan).single();
      let trialDaysLeft: number | null = null;
      if (sub?.is_trial) {
        const endDate = new Date(sub.ends_at);
        trialDaysLeft = Math.max(0, Math.ceil((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
      }
      return {
        plan: currentPlan, limits: limits as PlanLimits,
        subscription: (sub as Subscription | null) ?? null,
        isTrial: sub?.is_trial || false, trialDaysLeft,
        seasonEnd: sub?.season_end || "", isProration: false, prorataAmount: null,
      };
    },
  });

  const loading = enabled ? isLoading : false;
  const isPro = planStatus?.plan === "pro";
  const isFree = planStatus?.plan === "free";
  const isTrial = planStatus?.isTrial || false;

  const canDo = (feature: keyof PlanLimits): boolean => {
    if (!planStatus?.limits) return false;
    const val = planStatus.limits[feature];
    return typeof val === "boolean" ? val : true;
  };
  const getLimit = (feature: keyof PlanLimits): number => {
    if (!planStatus?.limits) return 0;
    const val = planStatus.limits[feature];
    return typeof val === "number" ? val : 0;
  };

  return {
    planStatus: planStatus ?? null,
    loading,
    isPro, isFree, isTrial,
    canDo, getLimit,
    trialDaysLeft: planStatus?.trialDaysLeft ?? null,
  };
}