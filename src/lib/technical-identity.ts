/**
 * @module technical-identity
 * @description Identifiants de connexion des joueurs mineurs sans e-mail.
 *
 * Un enfant de 12 ans n'a pas d'adresse, mais tout compte Supabase en exige
 * une. On lui en alloue une, technique, que la famille ne voit jamais : ce que
 * l'enfant tape, c'est l'IDENTIFIANT seul (`lucas.martin`), que cette couche
 * complète avant l'appel à Supabase.
 *
 * Aucun mécanisme d'authentification maison n'est introduit : Supabase reçoit
 * une adresse valide et vérifie le mot de passe normalement. C'est le modèle
 * des ENT scolaires, familier aux familles.
 *
 * ⚠️ Doit rester aligné avec `supabase/functions/_shared/technical-identity.ts`,
 * qui alloue ces adresses côté serveur. Le domaine est la seule valeur à tenir
 * synchronisée entre les deux.
 */

export const TECHNICAL_EMAIL_DOMAIN = "matchs360.jeunes";

/** Vrai si la saisie est un identifiant nu plutôt qu'une adresse e-mail. */
export function isIdentifier(input: string): boolean {
  return input.trim().length > 0 && !input.includes("@");
}

/** Vrai pour une adresse technique — jamais à afficher à un utilisateur. */
export function isTechnicalAddress(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase().endsWith(`@${TECHNICAL_EMAIL_DOMAIN}`);
}

/**
 * Adresse à transmettre à Supabase : la saisie telle quelle si c'est déjà une
 * adresse, complétée par le domaine technique si c'est un identifiant.
 */
export function resolveLoginEmail(input: string): string {
  const value = input.trim();
  return isIdentifier(value)
    ? `${value.toLowerCase()}@${TECHNICAL_EMAIL_DOMAIN}`
    : value;
}

/** Identifiant affichable : « lucas.martin@… » → « lucas.martin ». */
export function identifierFromEmail(email: string | null | undefined): string | null {
  if (!isTechnicalAddress(email)) return null;
  return email!.trim().toLowerCase().split("@")[0];
}

/**
 * Ce qu'il faut montrer à l'utilisateur pour un compte donné : l'identifiant
 * si l'adresse est technique, l'adresse sinon. Évite d'exposer une adresse
 * fictive que personne ne pourrait relever.
 */
export function displayLogin(email: string | null | undefined): string {
  return identifierFromEmail(email) ?? (email ?? "");
}
