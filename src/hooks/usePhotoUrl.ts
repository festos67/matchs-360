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
import { supabase } from "@/integrations/supabase/client";
import { MINOR_PHOTO_BUCKET, MINOR_PHOTO_SIGNED_TTL } from "@/lib/photo-storage";

export interface DisplayablePhoto {
  photo_url?: string | null;
  photo_is_minor?: boolean | null;
  image_rights_consent_at?: string | null;
}

export function usePhotoUrl(profile: DisplayablePhoto | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!profile?.photo_url) {
      setUrl(null);
      return;
    }
    // Photo droit-image non consenti → on masque (avatar fallback cote UI).
    if (!profile.image_rights_consent_at) {
      setUrl(null);
      return;
    }
    if (!profile.photo_is_minor) {
      setUrl(profile.photo_url);
      return;
    }
    // Mineur : photo_url contient un chemin storage, generer signed URL.
    (async () => {
      const { data, error } = await supabase.storage
        .from(MINOR_PHOTO_BUCKET)
        .createSignedUrl(profile.photo_url!, MINOR_PHOTO_SIGNED_TTL);
      if (!cancelled) setUrl(error ? null : data?.signedUrl ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [profile?.photo_url, profile?.photo_is_minor, profile?.image_rights_consent_at]);

  return url;
}