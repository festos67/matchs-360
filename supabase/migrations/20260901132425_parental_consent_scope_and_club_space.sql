-- =====================================================================
-- Consentement parental enrichi : attestation nominative, consentements
-- optionnels (photographie / auto-évaluation) et espace club.
--
-- 1) profiles.self_eval_consent_at/_by  — miroir de image_rights_consent_*
-- 2) can_self_evaluate()                — gate, ne vise QUE les < 15 ans
-- 3) trigger sur evaluations            — verrou réel côté base
-- 4) get_minor_for_pending_consent()    — débloque le nom de l'enfant sur
--                                         l'écran de consentement (le droit
--                                         de lecture dépendait jusqu'ici du
--                                         consentement lui-même : verrou
--                                         circulaire, cf is_legal_guardian_of)
-- 5) get_club_parental_consents()       — espace club, SANS signed_ip
-- 6) get_parental_consent_attestation() — page attestation, SANS signed_ip
-- =====================================================================

-- 1) ------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS self_eval_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS self_eval_consent_by uuid;

COMMENT ON COLUMN public.profiles.self_eval_consent_at IS
  'Consentement parental a l''auto-evaluation. NULL = non accorde. Ne '
  'contraint QUE les joueurs soumis au consentement parental (< 15 ans) ; '
  'les 15-17 et les majeurs s''auto-evaluent librement.';

-- 2) ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_self_evaluate(_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT NOT public.requires_parental_consent(_profile_id)
      OR EXISTS (
           SELECT 1 FROM public.profiles p
           WHERE p.id = _profile_id
             AND p.self_eval_consent_at IS NOT NULL
         );
$$;

-- 3) ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_self_eval_consent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.type = 'self' AND NOT public.can_self_evaluate(NEW.player_id) THEN
    RAISE EXCEPTION 'SELF_EVAL_CONSENT_MISSING';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_self_eval_consent ON public.evaluations;
CREATE TRIGGER trg_enforce_self_eval_consent
  BEFORE INSERT ON public.evaluations
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_self_eval_consent();

-- 4) ------------------------------------------------------------------
-- Le titulaire de l'autorite parentale doit pouvoir lire le nom de l'enfant
-- AVANT de consentir : une attestation qui ne designe pas l'enfant n'a
-- aucune valeur probante. La preuve de filiation utilisee ici est la meme
-- que celle exigee par record-parental-consent (designation 'pending' non
-- expiree, adressee a l'email authentifie du caller).
CREATE OR REPLACE FUNCTION public.get_minor_for_pending_consent(_minor_id uuid)
RETURNS TABLE (
  id uuid,
  first_name text,
  last_name text,
  club_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.id, p.first_name, p.last_name, c.name
  FROM public.profiles p
  LEFT JOIN public.clubs c ON c.id = p.club_id
  WHERE p.id = _minor_id
    AND p.deleted_at IS NULL
    AND coalesce(auth.jwt() ->> 'email', '') <> ''
    AND EXISTS (
      SELECT 1
      FROM public.guardian_designations gd
      WHERE gd.minor_profile_id = _minor_id
        AND gd.status = 'pending'
        AND gd.expires_at > now()
        AND lower(gd.guardian_email) = lower(auth.jwt() ->> 'email')
    );
$$;

REVOKE ALL ON FUNCTION public.get_minor_for_pending_consent(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_minor_for_pending_consent(uuid) TO authenticated;

-- 5) ------------------------------------------------------------------
-- Espace « attestations parentales » du responsable club.
-- signed_ip / signed_user_agent sont VOLONTAIREMENT absents : ce sont des
-- donnees personnelles du representant legal, sans utilite pour le club,
-- qui restent en base comme preuve technique (minimisation, art. 5.1.c).
CREATE OR REPLACE FUNCTION public.get_club_parental_consents(_club_id uuid)
RETURNS TABLE (
  consent_id uuid,
  minor_id uuid,
  minor_first_name text,
  minor_last_name text,
  guardian_first_name text,
  guardian_last_name text,
  guardian_email text,
  relationship text,
  signed_at timestamptz,
  revoked_at timestamptz,
  revoked_reason text,
  photo_consent_at timestamptz,
  self_eval_consent_at timestamptz,
  consent_scope jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    pc.id,
    m.id,
    m.first_name,
    m.last_name,
    g.first_name,
    g.last_name,
    g.email,
    pc.relationship::text,
    pc.signed_at,
    pc.revoked_at,
    pc.revoked_reason,
    m.image_rights_consent_at,
    m.self_eval_consent_at,
    pc.consent_scope
  FROM public.parental_consents pc
  JOIN public.profiles m ON m.id = pc.minor_profile_id
  LEFT JOIN public.profiles g ON g.id = pc.guardian_profile_id
  WHERE (public.is_club_admin(auth.uid(), _club_id) OR public.is_admin(auth.uid()))
    AND public.get_player_club_id(pc.minor_profile_id) = _club_id
  ORDER BY pc.signed_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_club_parental_consents(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_club_parental_consents(uuid) TO authenticated;

-- 6) ------------------------------------------------------------------
-- Attestation unitaire : lisible par le representant legal signataire, le
-- responsable du club, le coach de l'enfant et l'administrateur.
CREATE OR REPLACE FUNCTION public.get_parental_consent_attestation(_consent_id uuid)
RETURNS TABLE (
  consent_id uuid,
  minor_first_name text,
  minor_last_name text,
  guardian_first_name text,
  guardian_last_name text,
  guardian_email text,
  relationship text,
  club_name text,
  signed_at timestamptz,
  revoked_at timestamptz,
  photo_consent_at timestamptz,
  self_eval_consent_at timestamptz,
  consent_scope jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    pc.id,
    m.first_name,
    m.last_name,
    g.first_name,
    g.last_name,
    g.email,
    pc.relationship::text,
    c.name,
    pc.signed_at,
    pc.revoked_at,
    m.image_rights_consent_at,
    m.self_eval_consent_at,
    pc.consent_scope
  FROM public.parental_consents pc
  JOIN public.profiles m ON m.id = pc.minor_profile_id
  LEFT JOIN public.profiles g ON g.id = pc.guardian_profile_id
  LEFT JOIN public.clubs c ON c.id = m.club_id
  WHERE pc.id = _consent_id
    AND (
      pc.guardian_profile_id = auth.uid()
      OR public.is_admin(auth.uid())
      OR public.is_coach_of_player(auth.uid(), pc.minor_profile_id)
      OR public.is_club_admin(auth.uid(), public.get_player_club_id(pc.minor_profile_id))
    );
$$;

REVOKE ALL ON FUNCTION public.get_parental_consent_attestation(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_parental_consent_attestation(uuid) TO authenticated;
