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
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import type { PlanStatus, PlanLimits, Subscription, SubscriptionPlan } from "@/types/subscription";

export function usePlan() {
  const { profile, hasAdminRole } = useAuth();
  const [planStatus, setPlanStatus] = useState<PlanStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Recettage : les super admins sont toujours considérés Pro côté UI
    // (le bypass DB est géré par get_club_plan()).
    if (hasAdminRole) {
      (async () => {
        const { data: limits } = await supabase
          .from("plan_limits")
          .select("*")
          .eq("plan", "pro")
          .single();
        setPlanStatus({
          plan: "pro",
          limits: limits as PlanLimits,
          subscription: null,
          isTrial: false,
          trialDaysLeft: null,
          seasonEnd: "",
          isProration: false,
          prorataAmount: null,
        });
        setLoading(false);
      })();
      return;
    }

    if (!profile?.club_id) {
      setLoading(false);
      return;
    }

    const fetchPlan = async () => {
      try {
        const today = new Date().toISOString().split("T")[0];

        // 1. Récupérer l'abonnement actif (pro prioritaire sur free)
        const { data: sub } = await supabase
          .from("subscriptions")
          .select("*")
          .eq("club_id", profile.club_id)
          .gte("ends_at", today)
          .lte("starts_at", today)
          // ascending: false → 'pro' avant 'free' (ordre alphabétique inverse)
          .order("plan", { ascending: false })
          .limit(1)
          .maybeSingle();

        const currentPlan: SubscriptionPlan = (sub?.plan as SubscriptionPlan) || "free";

        // 2. Récupérer les limites du plan
        const { data: limits } = await supabase
          .from("plan_limits")
          .select("*")
          .eq("plan", currentPlan)
          .single();

        // 3. Calculer les infos trial
        let trialDaysLeft: number | null = null;
        if (sub?.is_trial) {
          const endDate = new Date(sub.ends_at);
          const now = new Date();
          trialDaysLeft = Math.max(
            0,
            Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          );
        }

        const seasonEnd = sub?.season_end || "";

        setPlanStatus({
          plan: currentPlan,
          limits: limits as PlanLimits,
          subscription: (sub as Subscription | null) ?? null,
          isTrial: sub?.is_trial || false,
          trialDaysLeft,
          seasonEnd,
          isProration: false,
          prorataAmount: null,
        });
      } catch (error) {
        console.error("Error fetching plan:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchPlan();
  }, [profile?.club_id, hasAdminRole]);

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
    planStatus,
    loading,
    isPro,
    isFree,
    isTrial,
    canDo,
    getLimit,
    trialDaysLeft: planStatus?.trialDaysLeft ?? null,
  };
}