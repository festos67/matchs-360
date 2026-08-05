-- B11 — resuspend_minor_on_revocation ne doit re-suspendre QUE les mineurs qui
-- requierent un consentement parental (<15 ans). Un 15-17 ans (auto-consentant
-- sur ses donnees) ne doit pas etre suspendu par la revocation d'un eventuel
-- consentement parental residuel.
CREATE OR REPLACE FUNCTION public.resuspend_minor_on_revocation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.requires_parental_consent(NEW.minor_profile_id)
     AND NOT public.minor_has_valid_consent(NEW.minor_profile_id) THEN
    BEGIN
      UPDATE public.profiles
         SET is_active = false, updated_at = now()
       WHERE id = NEW.minor_profile_id AND is_active = true;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'resuspend_minor_on_revocation failed for %: %', NEW.minor_profile_id, SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$function$;
