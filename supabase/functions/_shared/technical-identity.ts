/**
 * Identifiants techniques des joueurs mineurs sans adresse e-mail.
 *
 * Un enfant de 12 ans n'a pas d'adresse, mais `profiles.id` reference
 * `auth.users(id)` et `profiles.email` est NOT NULL : tout profil exige donc
 * un compte, et tout compte exige une adresse unique. On en fabrique une, que
 * la famille ne voit jamais.
 *
 * Ce que l'enfant tape pour se connecter, c'est l'IDENTIFIANT seul
 * (`lucas.martin`) ; l'application le complete avec le domaine ci-dessous
 * avant d'appeler Supabase. Modele des ENT scolaires.
 *
 * ⚠️ RESERVE ASSUMEE — `.jeunes` n'est pas un domaine de premier niveau
 * reserve. `.invalid` (RFC 2606) est le seul dont la non-delegation soit
 * garantie ; si `.jeunes` etait un jour delegue et le domaine enregistre par
 * un tiers, ces adresses deviendraient de vraies adresses lui appartenant.
 * Le garde-fou de `send-email.ts` empeche tout envoi, donc le risque reste
 * theorique. Choix produit assume : le domaine tient en UNE constante,
 * changer d'avis ne coute qu'une ligne (et une mise a jour des comptes
 * existants).
 */

export const TECHNICAL_EMAIL_DOMAIN = "matchs360.jeunes";

/** Retire accents, ponctuation et espaces : « Joël Le Guen » → « joelleguen ». */
function slug(input: string): string {
  return input
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Base de l'identifiant, sans suffixe de desambiguisation.
 * Volontairement SANS nom de club : un joueur qui change de club garde son
 * identifiant. Un identifiant qui change est un identifiant qu'on oublie.
 */
export function buildIdentifierBase(firstName: string, lastName: string): string {
  const first = slug(firstName ?? "");
  const last = slug(lastName ?? "");
  const base = [first, last].filter(Boolean).join(".");
  // Filet : un nom entierement non latin (cyrillique, arabe...) donnerait une
  // chaine vide. L'appelant ajoutera un suffixe numerique qui la rend unique.
  return base || "joueur";
}

/** Compose l'adresse technique a partir d'un identifiant deja desambiguise. */
export function technicalEmailFor(identifier: string): string {
  return `${identifier}@${TECHNICAL_EMAIL_DOMAIN}`;
}

/**
 * Vrai pour une adresse technique. Utilise par le garde-fou d'envoi ET par
 * l'interface, qui ne doit jamais afficher ces adresses a l'utilisateur.
 */
export function isTechnicalAddress(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase().endsWith(`@${TECHNICAL_EMAIL_DOMAIN}`);
}

/** Extrait l'identifiant affichable : « lucas.martin@… » → « lucas.martin ». */
export function identifierFromEmail(email: string | null | undefined): string | null {
  if (!isTechnicalAddress(email)) return null;
  return email!.trim().toLowerCase().split("@")[0];
}
