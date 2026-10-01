/**
 * @module photo-consent
 * @description Peut-on ajouter une photo à ce profil ? Pour un mineur, la
 *              photo n'est affichée qu'avec l'autorisation du représentant
 *              légal (profiles.image_rights_consent_at) : sans elle, on
 *              refuse l'ajout dès le choix de la photo, avant tout envoi,
 *              plutôt que d'enregistrer une photo qui resterait masquée.
 */
import { requiresParentalConsent } from "@/lib/age-policy";
import { isBirthdateMinor } from "@/lib/photo-storage";

/**
 * Raison du refus, ou null si la photo peut être ajoutée.
 * @param where  où l'utilisateur peut régulariser (15-17 ans) : « ci-dessous »
 *               dans « Profil Joueur », sinon renvoi vers cette fenêtre.
 */
export function photoBlockedReason(
  birthdate: string | null | undefined,
  imageConsentAt: string | null | undefined,
  where: "below" | "player-profile" = "player-profile",
): string | null {
  if (!isBirthdateMinor(birthdate) || imageConsentAt) return null;
  if (requiresParentalConsent(birthdate)) {
    return "Photo impossible : le représentant légal de ce joueur de moins de 15 ans n'a pas autorisé l'utilisation de son image. Sans cette autorisation, aucune photo ne peut être ajoutée.";
  }
  return where === "below"
    ? "Photo impossible : pour un joueur de 15 à 17 ans, enregistrez d'abord l'autorisation écrite du représentant légal (rubrique « Droit à l'image » ci-dessous)."
    : "Photo impossible : pour un joueur de 15 à 17 ans, enregistrez d'abord l'autorisation écrite du représentant légal depuis « Profil Joueur ».";
}

/** Nouveau joueur mineur : aucune autorisation n'existe encore. */
export const NEW_MINOR_PHOTO_REASON =
  "Photo impossible à la création d'un joueur mineur : elle pourra être ajoutée depuis « Profil Joueur » une fois l'autorisation du représentant légal obtenue.";
