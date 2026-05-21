BEGIN;

-- Phase 0 conformité mineurs : colonne minimale (sera raffinée Phase 1)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS birthdate date;

COMMENT ON COLUMN public.profiles.birthdate IS
  'Phase 0 (conformite mineurs): date de naissance. Seuil legal RGPD FR = 15 ans (raffine en Phase 1). En Phase 0, blocage conservateur a 18 ans (adultes uniquement pendant la beta).';

-- Garde-fou : bloquer la creation d'un profil mineur (< 18 ans) tant que
-- le workflow de protection n'est pas en place.
-- Seuil 18 ans = stopgap Phase 0 (rejet). A NE PAS CONFONDRE avec le seuil
-- legal RGPD FR de 15 ans qui sera utilise en Phase 1+ (acceptation avec
-- consentement parental). Pour modifier le seuil Phase 0 : un seul endroit ici.
CREATE OR REPLACE FUNCTION public.block_minor_signup_phase0()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  phase0_min_age_years CONSTANT int := 18;
BEGIN
  -- Ne s'applique qu'aux nouveaux profils ayant une birthdate renseignee.
  -- Les profils existants (birthdate NULL) ne sont pas verrouilles (grandfathering).
  IF NEW.birthdate IS NOT NULL
     AND NEW.birthdate > (CURRENT_DATE - (phase0_min_age_years || ' years')::interval) THEN
    RAISE EXCEPTION 'PHASE0_MINOR_BLOCKED: L''inscription des mineurs sera disponible prochainement. Cette version est reservee aux personnes majeures.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_minor_signup_phase0 ON public.profiles;
CREATE TRIGGER trg_block_minor_signup_phase0
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.block_minor_signup_phase0();

COMMIT;