/**
 * @module types/subscription
 * @description Types TypeScript du domaine Abonnements & Plans. Miroir TS des
 *              enums Postgres `subscription_plan` et `subscription_source`,
 *              complété par les structures applicatives PlanLimits, Subscription
 *              et PlanStatus consommées par usePlan / PlanLimitAlert / TrialBanner.
 * @exports
 *  - SubscriptionPlan : 'free' | 'pro'
 *  - SubscriptionSource : 'direct' | 'trial' | 'district' | 'league' | 'federation'
 *  - PlanLimits : limites par plan (max_teams, max_players_per_team, ...)
 *  - Subscription : ligne de la table subscriptions
 *  - PlanStatus : agrégat retourné par le hook usePlan
 * @maintenance
 *  - Doit rester synchronisé avec l'enum Postgres (voir types.ts auto-généré)
 *  - Limites définies en DB (table plan_limits) — source de vérité serveur
 *  - Hook consommateur : src/hooks/usePlan.ts
 */
export type SubscriptionPlan = 'free' | 'pro';
export type SubscriptionSource = 'direct' | 'trial' | 'district' | 'league' | 'federation';

export interface PlanLimits {
  plan: SubscriptionPlan;
  max_teams: number;
  max_players_per_team: number;
  max_coaches_per_team: number;
  max_coach_evals_per_player: number;
  max_self_evals_per_player: number;
  max_supporter_evals_per_player: number;
  max_supporters_per_team: number;
  max_objectives_per_player: number;
  max_team_objectives: number;
  can_export_pdf: boolean;
  can_compare_multi_source: boolean;
  can_version_framework: boolean;
}

export interface Subscription {
  id: string;
  club_id: string;
  plan: SubscriptionPlan;
  source: SubscriptionSource;
  starts_at: string;
  ends_at: string;
  season_start: string;
  season_end: string;
  is_trial: boolean;
  auto_renew: boolean;
  amount_cents: number | null;
  stripe_subscription_id: string | null;
}

export interface PlanStatus {
  plan: SubscriptionPlan;
  limits: PlanLimits;
  subscription: Subscription | null;
  isTrial: boolean;
  trialDaysLeft: number | null;
  seasonEnd: string;
  isProration: boolean;
  prorataAmount: number | null;
}