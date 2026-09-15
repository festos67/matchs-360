-- =====================================================================
-- 1. Notice d'information (tous les utilisateurs, tous les roles, tous
--    les ages) : accuse de lecture date et versionne. Ce n'est PAS un
--    consentement : c'est la preuve que l'information (RGPD art. 12-13) a
--    ete delivree.
-- 2. Droit a l'image des 15-17 ans : l'autorisation d'un parent, recue par
--    ecrit, peut etre enregistree par le staff du joueur (admin, responsable
--    du club, coach du joueur). Avant, aucun parcours ne le permettait et la
--    photo d'un 15-17 ans restait masquee en permanence.
-- =====================================================================

-- 1. Notice d'information -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.privacy_notice_acknowledgements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notice_version text NOT NULL,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, notice_version)
);

ALTER TABLE public.privacy_notice_acknowledgements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own privacy acknowledgements" ON public.privacy_notice_acknowledgements;
CREATE POLICY "Users read own privacy acknowledgements" ON public.privacy_notice_acknowledgements
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Users acknowledge privacy notice for themselves" ON public.privacy_notice_acknowledgements;
CREATE POLICY "Users acknowledge privacy notice for themselves" ON public.privacy_notice_acknowledgements
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

REVOKE ALL ON public.privacy_notice_acknowledgements FROM anon;
GRANT SELECT, INSERT ON public.privacy_notice_acknowledgements TO authenticated;

CREATE OR REPLACE FUNCTION public.has_acknowledged_privacy_notice(_version text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.privacy_notice_acknowledgements a
    WHERE a.user_id = auth.uid() AND a.notice_version = _version
  );
$$;

CREATE OR REPLACE FUNCTION public.acknowledge_privacy_notice(_version text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF _version IS NULL OR length(_version) = 0 OR length(_version) > 32 THEN
    RAISE EXCEPTION 'INVALID_VERSION' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.privacy_notice_acknowledgements (user_id, notice_version)
  VALUES (auth.uid(), _version)
  ON CONFLICT (user_id, notice_version) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.has_acknowledged_privacy_notice(text) FROM public, anon;
REVOKE ALL ON FUNCTION public.acknowledge_privacy_notice(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.has_acknowledged_privacy_notice(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.acknowledge_privacy_notice(text) TO authenticated;

-- 2. Droit a l'image des 15-17 ans ---------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS image_rights_consent_method text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_image_rights_consent_method_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_image_rights_consent_method_check
      CHECK (image_rights_consent_method IS NULL
             OR image_rights_consent_method IN ('self', 'guardian_online', 'parental_paper'));
  END IF;
END $$;

-- Garde : l'octroi pour un mineur reste reserve au representant legal, SAUF
-- autorisation parentale papier enregistree par le staff du joueur lui-meme
-- (consent_by = appelant), pour un joueur de 15 a 17 ans uniquement.
CREATE OR REPLACE FUNCTION public.guard_minor_image_consent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.image_rights_consent_at IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.image_rights_consent_at IS NULL)
     AND public.is_minor(NEW.id) THEN

    IF NEW.image_rights_consent_by IS NOT NULL
       AND public.is_legal_guardian_of(NEW.image_rights_consent_by, NEW.id) THEN
      RETURN NEW;
    END IF;

    IF NEW.image_rights_consent_method = 'parental_paper'
       AND NEW.image_rights_consent_by IS NOT NULL
       AND NEW.image_rights_consent_by = auth.uid()
       AND NOT public.requires_parental_consent(NEW.id)
       AND (
         public.is_admin(auth.uid())
         OR public.is_club_admin(auth.uid(), public.get_player_club_id(NEW.id))
         OR public.is_coach_of_player(auth.uid(), NEW.id)
       ) THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'MINOR_IMAGE_CONSENT_GUARDIAN_ONLY: le consentement a l''image d''un mineur doit etre donne par un titulaire legal'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_paper_image_consent(
  _player_id uuid,
  _granted boolean,
  _received_on date DEFAULT CURRENT_DATE
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF NOT (public.is_admin(v_caller)
          OR public.is_club_admin(v_caller, public.get_player_club_id(_player_id))
          OR public.is_coach_of_player(v_caller, _player_id)) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_minor(_player_id) OR public.requires_parental_consent(_player_id) THEN
    RAISE EXCEPTION 'PAPER_IMAGE_CONSENT_15_17_ONLY' USING ERRCODE = '22023';
  END IF;

  IF _granted AND (_received_on IS NULL OR _received_on > CURRENT_DATE) THEN
    RAISE EXCEPTION 'INVALID_RECEIVED_ON' USING ERRCODE = '22023';
  END IF;

  IF _granted THEN
    UPDATE public.profiles
       SET image_rights_consent_at = _received_on::timestamptz,
           image_rights_consent_by = v_caller,
           image_rights_consent_method = 'parental_paper'
     WHERE id = _player_id;
  ELSE
    UPDATE public.profiles
       SET image_rights_consent_at = NULL,
           image_rights_consent_by = NULL,
           image_rights_consent_ip = NULL,
           image_rights_consent_method = NULL
     WHERE id = _player_id;
  END IF;

  INSERT INTO public.audit_log (actor_id, actor_role, action, table_name, record_id, after_data)
  VALUES (
    v_caller,
    'staff',
    CASE WHEN _granted THEN 'image_rights_paper_recorded' ELSE 'image_rights_paper_revoked' END,
    'profiles',
    _player_id,
    jsonb_strip_nulls(jsonb_build_object('received_on', CASE WHEN _granted THEN _received_on END))
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.record_paper_image_consent(uuid, boolean, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.record_paper_image_consent(uuid, boolean, date) TO authenticated;
