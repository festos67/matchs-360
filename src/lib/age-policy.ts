/**
 * @module age-policy
 * @description Phase 6 (GO-LIVE) : le blocage Phase 0 "adultes only" a ete LEVE.
 *              Les inscriptions de mineurs sont desormais ouvertes avec les
 *              protections Phases 1-5 actives. Les helpers ci-dessous sont
 *              conserves pour deriver cote client :
 *              - isMinorPhase0()  : true si < 18 (utilise pour le watermark
 *                                   PDF mineur, A2-011)
 *              - requiresParentalConsent() : true si < 15 (declenche le
 *                                   formulaire guardian_email)
 *
 *              ⚠️ Gouvernance d'activation (cote DB) :
 *              - < 15 ans  : compte cree en PENDING (is_active=false),
 *                            active par le consentement parental (Phase 2)
 *              - 15-17     : auto-active (auto-consentement RGPD art. 8 FR),
 *                            mais photo sous autorite parentale (Phase 3)
 *              - 18+       : adulte, parcours inchange
 */

export const PHASE0_MIN_AGE_YEARS = 18;

export const PHASE0_ADULT_ONLY_MESSAGE =
  "L'inscription des mineurs est ouverte avec consentement parental (RGPD art. 8 FR).";

/**
 * Phase 2 RGPD art. 8 FR : seuil du consentement parental (15 ans).
 * En dessous, l'inscription requiert un titulaire de l'autorite parentale
 * (le workflow consentement est construit mais reste dormant en prod tant
 * que le blocage Phase 0 18+ est actif).
 */
export const PARENTAL_CONSENT_AGE_YEARS = 15;

export function requiresParentalConsent(
  birthdate: Date | string | null | undefined,
): boolean {
  if (!birthdate) return false;
  const d = birthdate instanceof Date ? birthdate : new Date(birthdate);
  if (Number.isNaN(d.getTime())) return false;
  const threshold = new Date();
  threshold.setFullYear(threshold.getFullYear() - PARENTAL_CONSENT_AGE_YEARS);
  return d > threshold;
}

/**
 * Retourne true si la date de naissance correspond a une personne ayant
 * strictement moins de PHASE0_MIN_AGE_YEARS ans aujourd'hui.
 */
export function isMinorPhase0(birthdate: Date | string | null | undefined): boolean {
  if (!birthdate) return false;
  const d = birthdate instanceof Date ? birthdate : new Date(birthdate);
  if (Number.isNaN(d.getTime())) return false;
  const threshold = new Date();
  threshold.setFullYear(threshold.getFullYear() - PHASE0_MIN_AGE_YEARS);
  return d > threshold;
}

/**
 * Detecte l'erreur SQL PHASE0_MINOR_BLOCKED levee par le trigger
 * `block_minor_signup_phase0` afin de l'afficher proprement cote UI.
 */
export function isPhase0MinorBlockedError(error: unknown): boolean {
  if (!error) return false;
  const msg =
    typeof error === "string"
      ? error
      : (error as { message?: string })?.message ?? "";
  return msg.includes("PHASE0_MINOR_BLOCKED");
}