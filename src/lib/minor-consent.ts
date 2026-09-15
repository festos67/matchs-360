/**
 * Consentement parental en attente (RGPD art. 8 FR, moins de 15 ans).
 *
 * Tant que le représentant légal n'a pas signé — ou après révocation —
 * aucune action ne peut porter sur le joueur : débriefs, objectifs,
 * supporters, demandes d'avis. Le verrou est posé en base
 * (trigger guard_minor_consent_pending) ; ce module sert uniquement à
 * masquer les actions et à traduire l'erreur côté interface.
 */
import { supabase } from "@/integrations/supabase/client";

export const MINOR_CONSENT_PENDING_CODE = "MINOR_CONSENT_PENDING";

export const MINOR_CONSENT_PENDING_TITLE = "Consentement parental en attente";

export const MINOR_CONSENT_PENDING_MESSAGE =
  "Le représentant légal n'a pas encore donné son consentement : aucune action n'est possible sur ce joueur pour le moment.";

export function isMinorConsentPendingError(error: unknown): boolean {
  const e = error as { message?: unknown; code?: unknown } | null | undefined;
  return (
    String(e?.message ?? "").includes(MINOR_CONSENT_PENDING_CODE) ||
    e?.code === MINOR_CONSENT_PENDING_CODE
  );
}

/**
 * Parmi `playerIds`, ceux dont le consentement parental est en attente et que
 * l'utilisateur connecté a le droit de voir. En cas d'erreur, renvoie un
 * ensemble vide : la base reste le verrou.
 */
export async function fetchConsentPendingPlayerIds(playerIds: string[]): Promise<Set<string>> {
  const ids = Array.from(new Set(playerIds.filter(Boolean)));
  if (ids.length === 0) return new Set();
  const { data, error } = await supabase.rpc(
    "get_consent_pending_player_ids" as never,
    { _player_ids: ids } as never,
  );
  if (error) {
    console.error("get_consent_pending_player_ids failed", error);
    return new Set();
  }
  return new Set(((data as string[] | null) ?? []).map(String));
}
