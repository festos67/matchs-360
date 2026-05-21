/**
 * BUG-PHOTO-003 — Résolution + base64 de la photo d'un profil pour usage PDF.
 *
 * Pipeline :
 *  1. `resolvePhotoUrl(profile)` applique gate consentement + signed URL mineur
 *  2. Si null → on retourne null (le PDF DOIT rendre un placeholder, pas l'octet)
 *  3. Sinon → fetch + FileReader.readAsDataURL pour embarquer dans le PDF
 *
 * Garantie : si le profil n'a pas de `image_rights_consent_at`, AUCUN octet
 * d'image n'arrive dans le PDF généré (le fichier exporté étant hors RLS).
 */
import { useEffect, useState } from "react";
import { resolvePhotoUrl, type ResolvablePhoto } from "@/lib/photo-resolver";

export function useResolvedPhotoBase64(profile: ResolvablePhoto | null | undefined): string | null {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const resolved = await resolvePhotoUrl(profile);
      if (!resolved) {
        if (!cancelled) setDataUrl(null);
        return;
      }
      try {
        const res = await fetch(resolved, { cache: "force-cache" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const reader = new FileReader();
        reader.onloadend = () => {
          if (!cancelled && typeof reader.result === "string") {
            setDataUrl(reader.result);
          }
        };
        reader.readAsDataURL(blob);
      } catch {
        if (!cancelled) setDataUrl(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    profile?.photo_url,
    profile?.photo_is_minor,
    profile?.image_rights_consent_at,
    profile?.birthdate,
  ]);

  return dataUrl;
}