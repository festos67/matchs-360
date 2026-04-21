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
/**
 * Plan d'abonnement d'un club.
 * Miroir TypeScript de l'enum Postgres `subscription_plan`.
 *
 * - `free` : plan gratuit, limites strictes (1 équipe, 15 joueurs, etc.).
 * - `pro`  : plan payant, quotas étendus + fonctionnalités premium
 *           (export PDF, comparaison multi-source, versionnage référentiel).
 */
export type SubscriptionPlan = 'free' | 'pro';

/**
 * Origine commerciale d'un abonnement (canal d'acquisition / facturation).
 * Miroir TS de l'enum Postgres `subscription_source`.
 *
 * - `direct`     : souscription Stripe individuelle par le club.
 * - `trial`      : essai gratuit auto-créé à l'inscription.
 * - `district`   : abonnement groupé district (B2B).
 * - `league`     : abonnement groupé ligue régionale.
 * - `federation` : abonnement national fédération.
 */
export type SubscriptionSource = 'direct' | 'trial' | 'district' | 'league' | 'federation';

/**
 * Limites quantitatives et capacités fonctionnelles d'un plan.
 * Source de vérité : table Postgres `plan_limits` (lecture seule via RLS).
 * Une valeur de `-1` représente conventionnellement "illimité".
 *
 * @property plan                            Identifiant du plan associé.
 * @property max_teams                       Nombre max d'équipes par club.
 * @property max_players_per_team            Nombre max de joueurs actifs par équipe.
 * @property max_coaches_per_team            Nombre max de coachs par équipe.
 * @property max_coach_evals_per_player      Débriefs coach max par joueur (par saison).
 * @property max_self_evals_per_player       Auto-évaluations max par joueur.
 * @property max_supporter_evals_per_player  Évaluations supporter max par joueur.
 * @property max_supporters_per_team         Supporters max par équipe.
 * @property max_objectives_per_player       Objectifs individuels max par joueur.
 * @property max_team_objectives             Objectifs collectifs max par équipe.
 * @property can_export_pdf                  Export PDF des résultats autorisé.
 * @property can_compare_multi_source        Radar comparatif coach/self/supporter.
 * @property can_version_framework           Historique & snapshots du référentiel.
 */
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

/**
 * Représente une ligne de la table `subscriptions`.
 * Un club a au plus UN abonnement actif à un instant donné (le plus récent
 * dont `ends_at >= now()`). L'historique est conservé pour facturation.
 *
 * @property starts_at / ends_at      Période de validité (ISO date).
 * @property season_start / season_end Saison sportive de rattachement.
 * @property is_trial                  Vrai si abonnement issu d'un essai gratuit.
 * @property auto_renew                Renouvellement Stripe automatique activé.
 * @property amount_cents              Montant facturé en centimes (null si trial).
 * @property stripe_subscription_id    Référence Stripe (null pour trial/groupé).
 */
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

/**
 * Agrégat applicatif retourné par le hook `usePlan()`.
 * Combine l'abonnement courant + les limites résolues + des indicateurs
 * dérivés (essai, jours restants, prorata) pour alimenter l'UI sans recalcul.
 *
 * @property plan             Plan effectif courant (résolu côté serveur).
 * @property limits           Limites associées au plan (jointure plan_limits).
 * @property subscription     Ligne subscription brute (null si aucune).
 * @property isTrial          Raccourci de subscription?.is_trial.
 * @property trialDaysLeft    Jours restants avant fin d'essai (null hors essai).
 * @property seasonEnd        Fin de saison sportive (ISO date).
 * @property isProration      Vrai si l'abonnement est calculé au prorata.
 * @property prorataAmount    Montant prorata en centimes (null sinon).
 *
 * @example Utilisation dans un composant React
 * ```tsx
 * import { usePlan } from "@/hooks/usePlan";
 *
 * export function CreateTeamButton() {
 *   const { plan, limits, isTrial, trialDaysLeft } = usePlan();
 *   const { data: teams } = useQuery(["teams"], fetchTeams);
 *
 *   const reachedLimit = (teams?.length ?? 0) >= limits.max_teams;
 *   const canExport = limits.can_export_pdf;
 *
 *   return (
 *     <>
 *       {isTrial && <TrialBanner daysLeft={trialDaysLeft} />}
 *       <Button disabled={reachedLimit}>
 *         {reachedLimit ? `Limite ${plan} atteinte` : "Créer une équipe"}
 *       </Button>
 *       {canExport && <ExportPdfButton />}
 *     </>
 *   );
 * }
 * ```
 *
 * @example Vérification de capacité avant action
 * ```ts
 * const { limits } = usePlan();
 * if (!limits.can_compare_multi_source) {
 *   toast.error("Comparaison multi-source réservée au plan Pro");
 *   return;
 * }
 * ```
 */
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