BEGIN;

-- =========================================================================
-- I6-001 : preuve de filiation au niveau données (trigger autoritaire)
-- =========================================================================
-- Avant ce patch, la vérification de filiation n'existait que dans l'edge
-- function record-parental-consent. La policy RLS sur parental_consents
-- n'exigeait que guardian_profile_id = auth.uid(), permettant à n'importe
-- quel user authentifié de devenir "tuteur" d'un mineur arbitraire par
-- INSERT direct (bypass total de l'edge).
--
-- Stratégie : trigger BEFORE INSERT qui réplique l'invariant de l'edge
-- (désignation pending, email du guardian = email de la désignation,
-- expires_at > now()). Enforce pour TOUS (y compris service_role) :
-- aucun chemin légitime n'existe sans désignation.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.guard_parental_consent_filiation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_guardian_email text;
BEGIN
  -- Email du guardian (= auth.users.email du compte qui insère)
  SELECT lower(email) INTO v_guardian_email
  FROM auth.users
  WHERE id = NEW.guardian_profile_id;

  -- Invariant aligné sur record-parental-consent (lignes 129-148) :
  -- désignation 'pending' matchant email ↔ mineur, non expirée.
  -- L'edge INSÈRE pendant que la désignation est pending, PUIS la
  -- consomme → le trigger laisse passer le flux légitime.
  -- Anti-rejeu : une désignation déjà consumed ne permettra pas un 2e INSERT.
  IF v_guardian_email IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.guardian_designations gd
    WHERE gd.minor_profile_id = NEW.minor_profile_id
      AND lower(gd.guardian_email) = v_guardian_email
      AND gd.status = 'pending'
      AND (gd.expires_at IS NULL OR gd.expires_at > now())
  ) THEN
    RAISE EXCEPTION
      'PARENTAL_CONSENT_NO_DESIGNATION: aucune désignation de tuteur valide pour ce mineur'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_parental_consent_filiation() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_guard_parental_consent_filiation ON public.parental_consents;
CREATE TRIGGER trg_guard_parental_consent_filiation
  BEFORE INSERT ON public.parental_consents
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_parental_consent_filiation();

COMMENT ON FUNCTION public.guard_parental_consent_filiation() IS
  'I6-001 : preuve de filiation autoritaire. Réplique l''invariant de record-parental-consent au niveau DB : exige guardian_designations.status=pending, email matchant, non expirée. Bloque l''INSERT direct par RLS qui ne contrôlait que guardian_profile_id = auth.uid().';

-- =========================================================================
-- Défense en profondeur : cible immuable en UPDATE
-- Seule la révocation (revoked_at, revoked_reason) reste autorisée.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.guard_parental_consent_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.minor_profile_id IS DISTINCT FROM OLD.minor_profile_id
     OR NEW.guardian_profile_id IS DISTINCT FROM OLD.guardian_profile_id
     OR NEW.relationship IS DISTINCT FROM OLD.relationship
     OR NEW.signed_at IS DISTINCT FROM OLD.signed_at THEN
    RAISE EXCEPTION
      'PARENTAL_CONSENT_IMMUTABLE: la cible et la signature du consentement sont immuables'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_parental_consent_update() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_guard_parental_consent_update ON public.parental_consents;
CREATE TRIGGER trg_guard_parental_consent_update
  BEFORE UPDATE ON public.parental_consents
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_parental_consent_update();

COMMENT ON FUNCTION public.guard_parental_consent_update() IS
  'I6-001 (défense en profondeur) : empêche la mutation de minor_profile_id, guardian_profile_id, relationship ou signed_at après création. La révocation (pose de revoked_at / revoked_reason) reste autorisée.';

COMMIT;