
BEGIN;

DO $$ BEGIN
  CREATE TYPE public.guardian_relationship AS ENUM
    ('mere', 'pere', 'tuteur_legal', 'autre_titulaire');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.parental_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  minor_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  guardian_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  relationship public.guardian_relationship NOT NULL,
  consent_scope jsonb NOT NULL DEFAULT '{"data_processing": true, "evaluations": true, "communications": true}'::jsonb,
  signed_at timestamptz NOT NULL DEFAULT now(),
  signed_ip inet,
  signed_user_agent text,
  revoked_at timestamptz,
  revoked_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS parental_consents_active_uniq
  ON public.parental_consents (minor_profile_id, guardian_profile_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS parental_consents_minor_idx
  ON public.parental_consents (minor_profile_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS parental_consents_guardian_idx
  ON public.parental_consents (guardian_profile_id) WHERE revoked_at IS NULL;

ALTER TABLE public.parental_consents ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.parental_consents IS
  'Phase 2 RGPD art. 8 FR : preuve de consentement parental (date, IP, scope, revocation). La presence d''une ligne non revoquee fait du guardian un titulaire legal du mineur. Source de verite (supporters_link.is_legal_guardian = cache).';

ALTER TABLE public.supporters_link
  ADD COLUMN IF NOT EXISTS is_legal_guardian boolean NOT NULL DEFAULT false;
ALTER TABLE public.supporters_link
  ADD COLUMN IF NOT EXISTS relationship public.guardian_relationship;

CREATE OR REPLACE FUNCTION public.is_legal_guardian_of(_guardian_id uuid, _minor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.parental_consents pc
    WHERE pc.guardian_profile_id = _guardian_id
      AND pc.minor_profile_id = _minor_id
      AND pc.revoked_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.minor_has_valid_consent(_minor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.parental_consents pc
    WHERE pc.minor_profile_id = _minor_id
      AND pc.revoked_at IS NULL
  );
$$;

REVOKE ALL ON FUNCTION public.is_legal_guardian_of(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.minor_has_valid_consent(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_legal_guardian_of(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.minor_has_valid_consent(uuid) TO authenticated, service_role;

-- RLS parental_consents
DROP POLICY IF EXISTS "Guardian views own consents" ON public.parental_consents;
CREATE POLICY "Guardian views own consents" ON public.parental_consents
  FOR SELECT TO authenticated
  USING (guardian_profile_id = auth.uid() OR is_admin(auth.uid()));

DROP POLICY IF EXISTS "Guardian inserts own consent" ON public.parental_consents;
CREATE POLICY "Guardian inserts own consent" ON public.parental_consents
  FOR INSERT TO authenticated
  WITH CHECK (guardian_profile_id = auth.uid());

DROP POLICY IF EXISTS "Guardian revokes own consent" ON public.parental_consents;
CREATE POLICY "Guardian revokes own consent" ON public.parental_consents
  FOR UPDATE TO authenticated
  USING (guardian_profile_id = auth.uid())
  WITH CHECK (guardian_profile_id = auth.uid());

-- Élargir le CHECK audit_log.action (régression C2-001) pour accepter
-- les events de consentement + events métier déjà émis ailleurs.
ALTER TABLE public.audit_log DROP CONSTRAINT IF EXISTS audit_log_action_check;
ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_action_check
  CHECK (action IN (
    'INSERT','UPDATE','DELETE',
    'parental_consent_granted','parental_consent_revoked',
    'plan_limit_bypassed','login_success','login_failed','export'
  ));

COMMIT;
