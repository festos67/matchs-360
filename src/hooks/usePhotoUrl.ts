/**
 * Phase 3 RGPD - Resolution affichable d'une photo de profil.
 *
 * - Adulte (photo_is_minor=false) : retourne `photo_url` tel quel
 *   (URL publique stockee directement en base — comportement historique).
 * - Mineur (photo_is_minor=true) : `photo_url` contient le chemin storage ;
 *   on cree une signed URL TTL 5 min via le bucket prive.
 *
 * Dans TOUS les cas, la photo n'est resolue que si
 * `image_rights_consent_at` est present (art. 9 CC). Sinon `null` →
 * fallback avatar initiales cote consommateur.
 */
import { useEffect, useState } from "react";
import { resolvePhotoUrl, type ResolvablePhoto } from "@/lib/photo-resolver";

export type DisplayablePhoto = ResolvablePhoto;

export function usePhotoUrl(profile: DisplayablePhoto | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    resolvePhotoUrl(profile).then((resolved) => {
      if (!cancelled) setUrl(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [
    profile?.photo_url,
    profile?.photo_is_minor,
    profile?.image_rights_consent_at,
    profile?.birthdate,
  ]);

  return url;
}