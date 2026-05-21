BEGIN;

CREATE OR REPLACE FUNCTION public.guard_minor_image_consent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- I6-002 / RG5-004 (art. 9 CC) : le consentement a l'image d'un MINEUR
  -- (< 18 ans) doit etre donne par un titulaire legal. On agit UNIQUEMENT
  -- a l'OCTROI (NULL -> NOT NULL) et UNIQUEMENT sur un mineur, pour ne pas
  -- bloquer :
  --   - les modifications d'autres champs par un club_admin/coach
  --   - le consentement self d'un adulte
  --   - la revocation (NOT NULL -> NULL), notamment via execute-erasure
  IF NEW.image_rights_consent_at IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.image_rights_consent_at IS NULL)
     AND public.is_minor(NEW.id) THEN
    IF NEW.image_rights_consent_by IS NULL
       OR NOT public.is_legal_guardian_of(NEW.image_rights_consent_by, NEW.id) THEN
      RAISE EXCEPTION 'MINOR_IMAGE_CONSENT_GUARDIAN_ONLY: le consentement a l''image d''un mineur doit etre donne par un titulaire legal'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_minor_image_consent() FROM PUBLIC;

COMMENT ON FUNCTION public.guard_minor_image_consent() IS
  'I6-002 / RG5-004 (art. 9 CC) : le consentement a l''image d''un MINEUR (< 18)
   ne peut etre pose que par un titulaire legal (is_legal_guardian_of).
   Trigger autoritaire scopé aux colonnes image_rights_* et a l''octroi.
   Bloque un club_admin/coach qui tenterait de consentir a la place du tuteur.';

DROP TRIGGER IF EXISTS trg_guard_minor_image_consent ON public.profiles;
CREATE TRIGGER trg_guard_minor_image_consent
  BEFORE INSERT OR UPDATE OF image_rights_consent_at, image_rights_consent_by
  ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_minor_image_consent();

COMMIT;