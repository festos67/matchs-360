/**
 * Phase 3 RGPD - Routage des photos de profil.
 *
 * - Adulte (ou birthdate inconnue) : bucket public `user-photos`,
 *   chemin `<userId>/photo.<ext>`, getPublicUrl (comportement historique
 *   PRESERVE - decision memoire projet pour ne pas casser le rendu <img>).
 * - Mineur (< 18 ans, art. 9 CC) : bucket prive `user-photos-minors`,
 *   chemin `<userId>/photo-<uuid>.<ext>`, signed URL TTL court.
 *
 * Le rendu effectif est gere par `usePhotoUrl`, qui masque la photo
 * tant que `image_rights_consent_at IS NULL`.
 */
import { supabase } from "@/integrations/supabase/client";
import { validateUpload } from "@/lib/upload-validation";

export const PUBLIC_PHOTO_BUCKET = "user-photos";
export const MINOR_PHOTO_BUCKET = "user-photos-minors";
export const MINOR_PHOTO_SIGNED_TTL = 300; // seconds

/** True when `birthdate` indicates strict minority (< 18 ans). */
export function isBirthdateMinor(birthdate: string | null | undefined): boolean {
  if (!birthdate) return false;
  const bd = new Date(birthdate);
  if (Number.isNaN(bd.getTime())) return false;
  const now = new Date();
  let age = now.getFullYear() - bd.getFullYear();
  const m = now.getMonth() - bd.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < bd.getDate())) age -= 1;
  return age < 18;
}

export interface UploadProfilePhotoResult {
  /** Public URL (cache-busted) for adults, storage path for minors. */
  photo_url: string;
  /** Storage object key (always the bucket-relative path). */
  path: string;
  /** Routed bucket. */
  bucket: typeof PUBLIC_PHOTO_BUCKET | typeof MINOR_PHOTO_BUCKET;
  /** True if stored in the private minor bucket. */
  photo_is_minor: boolean;
}

/**
 * Upload a profile photo to the correct bucket based on the target user's age.
 * Caller is responsible for persisting `photo_url` and `photo_is_minor` on
 * `profiles`.
 *
 * For minors: `photo_url` stores the storage path (NOT a public URL) — the
 * consuming `<img>` must obtain a signed URL via `usePhotoUrl`.
 */
export async function uploadProfilePhoto(
  userId: string,
  file: File,
  targetBirthdate: string | null | undefined,
): Promise<UploadProfilePhotoResult> {
  const { contentType, safeExt } = validateUpload(file, "image");
  const minor = isBirthdateMinor(targetBirthdate);
  const bucket = minor ? MINOR_PHOTO_BUCKET : PUBLIC_PHOTO_BUCKET;
  // Unpredictable path for minors to defeat URL guessing if the bucket were
  // ever misconfigured; stable filename for adults to preserve historical
  // behavior (cache-busting handled via ?t= timestamp).
  const fileName = minor ? `photo-${crypto.randomUUID()}.${safeExt}` : `photo.${safeExt}`;
  const path = `${userId}/${fileName}`;
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { upsert: true, contentType });
  if (error) throw error;
  if (minor) {
    return { photo_url: path, path, bucket, photo_is_minor: true };
  }
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return {
    photo_url: `${data.publicUrl}?t=${Date.now()}`,
    path,
    bucket,
    photo_is_minor: false,
  };
}

/**
 * RG7-001 — Wrapper pour les flux staff (Create/Edit modals) qui éditent
 * un profil EXISTANT. Récupère la birthdate depuis `profiles` puis route
 * via `uploadProfilePhoto` (mineur → bucket privé). Évite que chaque
 * modal hardcode le bucket public.
 *
 * Si la birthdate ne peut pas être lue (RLS, profil inexistant), on
 * échoue plutôt que de router par défaut en public — fail-safe mineur.
 */
export async function uploadProfilePhotoForExistingUser(
  userId: string,
  file: File,
): Promise<UploadProfilePhotoResult> {
  const { data, error } = await supabase
    .from("profiles")
    .select("birthdate")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return uploadProfilePhoto(userId, file, data?.birthdate ?? null);
}