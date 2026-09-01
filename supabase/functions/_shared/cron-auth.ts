/**
 * Authentification des appels DECLENCHES PAR LA BASE (pg_cron / pg_net).
 *
 * Ces endpoints tournent en `verify_jwt = false` : il n'y a pas d'utilisateur
 * derriere l'appel, donc aucun JWT a verifier. Sans garde applicative, ils
 * sont ouverts a tout le monde — et ceux qui envoient des e-mails deviennent
 * un relais de spam doublé d'un oracle sur l'existence des comptes.
 *
 * Le secret partage vit dans Vault (`cron_auth_secret`) et se lit par la RPC
 * `get_cron_secret`. Les declencheurs SQL le placent deja dans l'en-tete
 * Authorization.
 *
 * Extrait de dispatch-guardian-notifications, ou ce controle etait implemente
 * correctement mais en local — d'ou son absence dans les fonctions sœurs.
 */

/** Comparaison constant-time (cf F-404). NE PAS remplacer par ===. */
export function timingSafeEqualStr(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const abuf = enc.encode(a);
  const bbuf = enc.encode(b);
  const len = Math.max(abuf.byteLength, bbuf.byteLength);
  let diff = abuf.byteLength ^ bbuf.byteLength;
  for (let i = 0; i < len; i++) {
    const av = i < abuf.byteLength ? abuf[i] : 0;
    const bv = i < bbuf.byteLength ? bbuf[i] : 0;
    diff |= av ^ bv;
  }
  return diff === 0;
}

interface CronCapableClient {
  rpc: (fn: string) => Promise<{ data: unknown; error: unknown }>;
}

/**
 * Vrai si la requete porte le secret cron attendu.
 *
 * Fail-closed : secret absent en Vault, RPC en erreur ou en-tete manquant
 * renvoient false. Mieux vaut ne pas notifier que notifier n'importe qui.
 */
export async function hasValidCronSecret(
  req: Request,
  client: CronCapableClient,
): Promise<boolean> {
  const provided = (req.headers.get("authorization") ?? "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  if (!provided) return false;

  const { data: cronSecret, error } = await client.rpc("get_cron_secret");
  if (error || typeof cronSecret !== "string" || cronSecret.length === 0) {
    console.error("cron secret unavailable", error);
    return false;
  }

  return timingSafeEqualStr(provided, cronSecret);
}
