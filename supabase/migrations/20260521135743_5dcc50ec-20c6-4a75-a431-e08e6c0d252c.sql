-- =========================================================================
-- PHASE 6 RGPD MINEURS — Cloture & Go-Live
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- ETAPE 1 : Surnom protege (A2-016)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_minor_nickname_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.nickname IS DISTINCT FROM OLD.nickname
     AND public.is_minor(NEW.id)
     AND auth.role() IS DISTINCT FROM 'service_role'
     AND NEW.id IS DISTINCT FROM auth.uid()
     AND NOT public.is_legal_guardian_of(auth.uid(), NEW.id)
     AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'NICKNAME_PROTECTED: Le surnom d''un mineur ne peut etre modifie que par lui-meme, son representant legal ou un administrateur.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_minor_nickname ON public.profiles;
CREATE TRIGGER trg_guard_minor_nickname
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_minor_nickname_update();

COMMENT ON FUNCTION public.guard_minor_nickname_update() IS
  'Phase 6 RGPD mineurs (A2-016) : interdit aux coachs / club_admin de modifier le surnom d''un mineur. Seuls le mineur lui-meme, son representant legal (parental_consents) et les admins sont autorises.';

-- -------------------------------------------------------------------------
-- ETAPE 2 : Retention declaree (A2-015) — anonymisation a 3 ans post-depart
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_old_minor_evaluations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_evals_count int;
  v_scores_count int;
BEGIN
  -- Anonymise les notes nominatives des evaluations dont le joueur (mineur)
  -- a quitte toutes ses equipes depuis > 3 ans.
  WITH upd AS (
    UPDATE public.evaluations e
    SET notes = '[Archive anonymisee - retention 3 ans]'
    WHERE e.notes IS NOT NULL
      AND e.notes <> '[Archive anonymisee - retention 3 ans]'
      AND public.is_minor(e.player_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.team_members tm
        WHERE tm.user_id = e.player_id
          AND (
            tm.is_active = true
            OR (tm.left_at IS NOT NULL AND tm.left_at > (CURRENT_DATE - INTERVAL '3 years'))
            OR (tm.left_at IS NULL AND tm.is_active = false)
          )
      )
    RETURNING 1
  )
  SELECT count(*) INTO v_evals_count FROM upd;

  -- Idem sur les commentaires de scores.
  WITH upd2 AS (
    UPDATE public.evaluation_scores es
    SET comment = '[Archive anonymisee - retention 3 ans]'
    FROM public.evaluations e
    WHERE es.evaluation_id = e.id
      AND es.comment IS NOT NULL
      AND es.comment <> '[Archive anonymisee - retention 3 ans]'
      AND public.is_minor(e.player_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.team_members tm
        WHERE tm.user_id = e.player_id
          AND (
            tm.is_active = true
            OR (tm.left_at IS NOT NULL AND tm.left_at > (CURRENT_DATE - INTERVAL '3 years'))
            OR (tm.left_at IS NULL AND tm.is_active = false)
          )
      )
    RETURNING 1
  )
  SELECT count(*) INTO v_scores_count FROM upd2;

  INSERT INTO public.audit_log (actor_role, action, table_name, after_data)
  VALUES (
    'system',
    'minor_retention_purge',
    'evaluations',
    jsonb_build_object('evaluations_anonymized', v_evals_count, 'scores_anonymized', v_scores_count, 'ran_at', now())
  );
END;
$$;

COMMENT ON FUNCTION public.purge_old_minor_evaluations() IS
  'Phase 6 RGPD mineurs (A2-015) : politique de retention 3 ans. Anonymise (ne supprime pas) les commentaires nominatifs des evaluations de mineurs ayant quitte le club depuis plus de 3 ans. A programmer mensuellement.';

-- -------------------------------------------------------------------------
-- ETAPE 5 : GO-LIVE — gouvernance d'activation (remplace blocage Phase 0)
-- -------------------------------------------------------------------------

-- 5.a Colonne is_active sur profiles (mecanisme d'activation cible)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.profiles.is_active IS
  'Phase 6 — false = compte en attente. Les mineurs < 15 ans sont crees en pending et actives par le consentement parental (record-parental-consent).';

-- 5.b Gouvernance d'activation : < 15 = pending, 15-17 / 18+ = actif
CREATE OR REPLACE FUNCTION public.govern_minor_activation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Pas de date de naissance : laisse actif (parcours legacy / adultes signup)
  IF NEW.birthdate IS NULL THEN
    RETURN NEW;
  END IF;

  -- < 15 ans : creation en pending obligatoire (active par le consentement parental)
  IF NEW.birthdate > (CURRENT_DATE - INTERVAL '15 years') THEN
    NEW.is_active := false;
  END IF;

  -- 15-17 (auto-consentement RGPD art. 8 FR) et adultes : is_active inchange
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.govern_minor_activation() IS
  'Phase 6 GO-LIVE : remplace le blocage Phase 0 (block_minor_signup_phase0). < 15 ans cree en pending (active par le consentement parental Phase 2 via record-parental-consent). 15-17 auto-consentement donnees (mais photo sous autorite parentale jusqu''a 18, cf. Phase 3). 18+ adulte, parcours inchange.';

DROP TRIGGER IF EXISTS trg_govern_minor_activation ON public.profiles;
CREATE TRIGGER trg_govern_minor_activation
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.govern_minor_activation();

-- 5.c LEVEE DU BLOCAGE PHASE 0 — ouverture legale des inscriptions de mineurs
DROP TRIGGER IF EXISTS trg_block_minor_signup_phase0 ON public.profiles;

-- Conservation de la fonction (historique / rollback rapide) avec commentaire explicite
COMMENT ON FUNCTION public.block_minor_signup_phase0() IS
  'OBSOLETE depuis Phase 6 GO-LIVE — remplace par govern_minor_activation(). Conservee pour rollback uniquement. NE PAS reactiver sans desactiver govern_minor_activation, sinon double blocage.';

-- 5.d Activation atomique a la pose d'un consentement parental valide.
--     Filet de securite : meme si l'edge function record-parental-consent
--     oublie de flipper is_active, ce trigger garantit l'activation cote DB.
CREATE OR REPLACE FUNCTION public.activate_minor_on_consent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.revoked_at IS NULL THEN
    UPDATE public.profiles
       SET is_active = true,
           updated_at = now()
     WHERE id = NEW.minor_profile_id
       AND is_active = false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_activate_minor_on_consent ON public.parental_consents;
CREATE TRIGGER trg_activate_minor_on_consent
  AFTER INSERT ON public.parental_consents
  FOR EACH ROW EXECUTE FUNCTION public.activate_minor_on_consent();

COMMENT ON FUNCTION public.activate_minor_on_consent() IS
  'Phase 6 — Filet de securite : active automatiquement le profil mineur des qu''un consentement parental valide est enregistre. Garantit la coherence Phase 2 <-> Phase 6 meme si l''edge function ne le fait pas explicitement.';

COMMIT;