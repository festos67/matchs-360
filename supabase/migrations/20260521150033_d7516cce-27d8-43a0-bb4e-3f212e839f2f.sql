-- Phase 6 RGPD / BUG-PHOTO-001 — guard_profile_photo_url accepte les
-- chemins privés des photos de mineurs (bucket user-photos-minors) tout
-- en preservant strictement la validation existante des URLs publiques
-- adultes (validate_storage_url, F-205/F-502).

BEGIN;

CREATE OR REPLACE FUNCTION public.guard_profile_photo_url()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_minor      boolean;
  v_first_segment text;
  v_ext           text;
BEGIN
  -- Pas de changement de photo_url -> rien a valider.
  IF NEW.photo_url IS NOT DISTINCT FROM COALESCE(OLD.photo_url, '') THEN
    RETURN NEW;
  END IF;

  -- NULL / vide : pas de photo, autorise.
  IF NEW.photo_url IS NULL OR NEW.photo_url = '' THEN
    RETURN NEW;
  END IF;

  -- Source de verite minorite : birthdate (pas le seul flag photo_is_minor).
  v_is_minor := NEW.birthdate IS NOT NULL
                AND NEW.birthdate > (CURRENT_DATE - INTERVAL '18 years');

  IF v_is_minor THEN
    -- MINEUR : chemin brut du bucket prive user-photos-minors.
    -- Format canonique attendu : '<profile_id>/photo-<token>.<ext>'.
    -- Anti-injection : le 1er segment DOIT etre l'UUID du profil.
    v_first_segment := split_part(NEW.photo_url, '/', 1);
    IF v_first_segment IS DISTINCT FROM NEW.id::text THEN
      RAISE EXCEPTION 'Invalid minor photo path: must be own folder'
        USING ERRCODE = 'check_violation';
    END IF;

    -- Pas d'URL absolue, pas de path-traversal, pas d'espaces/HTML.
    IF NEW.photo_url ~ '\.\.'
       OR NEW.photo_url ~ '[[:space:]<>"]'
       OR NEW.photo_url ~* '^https?://' THEN
      RAISE EXCEPTION 'Invalid minor photo path: malformed'
        USING ERRCODE = 'check_violation';
    END IF;

    -- Whitelist d'extensions (memes formats que le bucket prive).
    v_ext := lower(substring(NEW.photo_url FROM '\.([a-zA-Z0-9]+)$'));
    IF v_ext IS NULL OR v_ext NOT IN ('jpg','jpeg','png','webp') THEN
      RAISE EXCEPTION 'Invalid minor photo path: extension'
        USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
  END IF;

  -- ADULTE : validation HISTORIQUE inchangee (URL publique user-photos,
  -- 1er segment = NEW.id, SSRF/XSS via validate_storage_url).
  IF NOT public.validate_storage_url(NEW.photo_url, 'user-photos', NEW.id::text) THEN
    RAISE EXCEPTION 'Invalid storage URL for photo_url'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.guard_profile_photo_url() IS
  'Phase 6 RGPD : accepte chemin prive <id>/photo-<token>.<ext> pour mineurs (birthdate <18) et URL publique user-photos pour adultes (validate_storage_url inchange). Anti path-injection : 1er segment = profile.id.';

COMMIT;
