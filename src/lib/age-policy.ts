/**
 * @module age-policy
 * @description Phase 0 (conformite mineurs) : seuil unique pour le blocage
 *              "adultes uniquement" pendant la beta. Stopgap temporaire en
 *              attendant le workflow complet de consentement parental (Phase 1+).
 *
 *              ⚠️ NE PAS CONFONDRE :
 *              - Phase 0 (ici) : seuil 18 ans → REJET des mineurs.
 *              - Phase 1+ : seuil legal RGPD FR 15 ans → ACCEPTATION
 *                avec consentement parental.
 *
 *              Pour faire evoluer le seuil Phase 0, modifier UNIQUEMENT
 *              `PHASE0_MIN_AGE_YEARS` ici. Le trigger SQL
 *              `block_minor_signup_phase0` doit etre mis a jour en parallele.
 */

export const PHASE0_MIN_AGE_YEARS = 18;

export const PHASE0_ADULT_ONLY_MESSAGE =
  "L'inscription des mineurs sera disponible prochainement. Cette version est reservee aux personnes majeures.";

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