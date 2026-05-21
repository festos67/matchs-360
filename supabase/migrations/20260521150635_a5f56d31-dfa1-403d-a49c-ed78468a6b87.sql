-- BUG-AGE-003 — Gouvernance d'activation autoritaire sur INSERT ET UPDATE.
-- Le trigger Phase 6 ne fire qu'en BEFORE INSERT : quand handle_new_user
-- cree le profil avec birthdate=NULL puis un UPDATE pose la birthdate, le
-- mineur < 15 reste is_active=true. On etend le trigger a UPDATE OF
-- birthdate, is_active et on consulte minor_has_valid_consent pour ne
-- pas casser l'activation legitime par le consentement parental.

BEGIN;

CREATE OR REPLACE FUNCTION public.govern_minor_activation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Pas de date de naissance : laisse actif (legacy / adultes signup sans birthdate).
  IF NEW.birthdate IS NULL THEN
    RETURN NEW;
  END IF;

  -- Seuil RGPD art. 8 FR = 15 ans (PAS 18 ans, qui est le droit a l'image).
  -- < 15 ans : pending TANT QUE pas de consentement parental valide.
  --   Le trigger activate_minor_on_consent (AFTER INSERT parental_consents)
  --   insere le consentement PUIS flippe is_active=true ; ici, lors de
  --   l'UPDATE OF is_active declenche par cette activation,
  --   minor_has_valid_consent(NEW.id) vaut true -> on laisse passer.
  IF NEW.birthdate > (CURRENT_DATE - INTERVAL '15 years')
     AND NOT public.minor_has_valid_consent(NEW.id) THEN
    NEW.is_active := false;
  END IF;

  -- 15-17 (auto-consentement donnees) et adultes : is_active inchange.
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.govern_minor_activation() IS
  'BUG-AGE-003 : autoritaire sur INSERT ET UPDATE OF birthdate,is_active. Mineur < 15 sans consentement parental valide -> is_active=false, quel que soit l''ordre (INSERT avec birthdate NULL puis UPDATE birthdate, ou tentative de reactivation manuelle). Active legitimement par activate_minor_on_consent (consentement insere AVANT le flip is_active).';

-- Re-poser le trigger sur INSERT ET UPDATE (couvre le pattern
-- handle_new_user -> UPDATE birthdate qui contournait le BEFORE INSERT).
DROP TRIGGER IF EXISTS trg_govern_minor_activation ON public.profiles;
CREATE TRIGGER trg_govern_minor_activation
  BEFORE INSERT OR UPDATE OF birthdate, is_active ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.govern_minor_activation();

COMMIT;
