-- §B RGPD art. 7§3 : re-suspendre le mineur < 15 quand son DERNIER
-- consentement parental valide est revoque. Multi-tuteurs : no-op tant
-- qu'au moins un consentement reste valide.
--
-- Surete (cf inventaire triggers profiles) :
--   * govern_minor_activation (BEFORE UPD is_active) : idempotent, confirme
--     is_active=false, pas de boucle.
--   * notify_guardian_on_profile_update (AFTER UPD) : changed_fields ne
--     contient PAS is_active -> changed_fields=NULL -> pas de notif parasite.
--   * trg_audit_profiles : log defensif, safe.
--
-- La re-suspension est encapsulee dans EXCEPTION WHEN OTHERS -> RAISE WARNING
-- pour que la revocation reussisse meme si l'UPDATE profiles plante
-- (le retrait du consentement prime, art. 7 §3).

BEGIN;

CREATE OR REPLACE FUNCTION public.resuspend_minor_on_revocation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Ne reagir qu'a une VRAIE revocation : transition NULL -> NOT NULL.
  IF OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL THEN
    RETURN NEW;
  END IF;

  -- Multi-tuteurs : re-suspendre uniquement si plus AUCUN consentement
  -- valide ne reste pour ce mineur.
  IF NOT public.minor_has_valid_consent(NEW.minor_profile_id) THEN
    BEGIN
      UPDATE public.profiles
         SET is_active = false,
             updated_at = now()
       WHERE id = NEW.minor_profile_id
         AND is_active = true;
      -- govern_minor_activation (BEFORE UPD) re-evalue et confirme : OK.
    EXCEPTION WHEN OTHERS THEN
      -- La revocation ne doit pas etre annulee si la re-suspension plante.
      RAISE WARNING 'resuspend_minor_on_revocation failed for %: %',
        NEW.minor_profile_id, SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.resuspend_minor_on_revocation() IS
  '§B RGPD art. 7§3 : re-suspend un mineur < 15 (is_active=false) quand son DERNIER consentement parental valide est revoque. No-op si un autre consentement valide reste (multi-tuteurs). Echec encapsule en RAISE WARNING : la revocation prime, ne doit jamais etre annulee par un echec de re-suspension.';

DROP TRIGGER IF EXISTS trg_resuspend_minor_on_revocation ON public.parental_consents;
CREATE TRIGGER trg_resuspend_minor_on_revocation
  AFTER UPDATE OF revoked_at ON public.parental_consents
  FOR EACH ROW EXECUTE FUNCTION public.resuspend_minor_on_revocation();

COMMIT;