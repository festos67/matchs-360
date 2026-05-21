/**
 * BUG-PHOTO-002/003 — Resolver async centralisé pour les photos de profil.
 *
 * Applique la même politique que `usePhotoUrl` (mineur → signed URL TTL court
 * depuis bucket privé, adulte → URL publique) mais en mode async, utilisable
 * hors React (génération PDF, exports, etc.).
 *
 * Renvoie null si :
 *   - pas de photo_url
 *   - pas de consentement image (`image_rights_consent_at` NULL)
 *   - erreur de signature pour un mineur
 *
 * Un PDF qui reçoit null DOIT rendre un placeholder/initiales — JAMAIS le
 * chemin brut ni les octets de l'image (le fichier exporté est hors contrôle
 * d'accès).
 */
import { supabase } from "@/integrations/supabase/client";
import {
  MINOR_PHOTO_BUCKET,
  MINOR_PHOTO_SIGNED_TTL,
  isBirthdateMinor,
} from "@/lib/photo-storage";

export interface ResolvablePhoto {
  photo_url?: string | null;
  photo_is_minor?: boolean | null;
  image_rights_consent_at?: string | null;
  /** Fallback minor detection si photo_is_minor absent du payload */
  birthdate?: string | null;
}

/**
 * Détermine si le profil doit être traité comme mineur pour le routage photo.
 * Fail-safe : en cas de doute → considéré mineur (bucket privé attendu).
 */
function isMinorForPhoto(p: ResolvablePhoto): boolean {
  if (typeof p.photo_is_minor === "boolean") return p.photo_is_minor;
  return isBirthdateMinor(p.birthdate);
}

export async function resolvePhotoUrl(
  profile: ResolvablePhoto | null | undefined,
): Promise<string | null> {
  if (!profile?.photo_url) return null;
  // Gate consentement (mineur ET adulte) — art. 9 CC + RGPD
  if (!profile.image_rights_consent_at) return null;

  if (!isMinorForPhoto(profile)) {
    // Adulte : URL publique stockée telle quelle.
    return profile.photo_url;
  }

  // Mineur : photo_url = chemin storage privé → signed URL TTL court.
  const { data, error } = await supabase.storage
    .from(MINOR_PHOTO_BUCKET)
    .createSignedUrl(profile.photo_url, MINOR_PHOTO_SIGNED_TTL);
  if (error) return null;
  return data?.signedUrl ?? null;
}