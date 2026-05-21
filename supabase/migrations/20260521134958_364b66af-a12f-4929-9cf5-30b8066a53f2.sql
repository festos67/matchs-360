
CREATE TABLE IF NOT EXISTS public.erasure_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_profile_id uuid NOT NULL,
  requested_by uuid NOT NULL,
  reason text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  scheduled_for timestamptz NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  status text NOT NULL DEFAULT 'pending',
  cancelled_at timestamptz,
  executed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.erasure_requests ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_erasure_requests_pending
  ON public.erasure_requests (scheduled_for)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_erasure_requests_subject
  ON public.erasure_requests (subject_profile_id);

COMMENT ON TABLE public.erasure_requests IS
  'Phase 5 RGPD art. 17 : demandes d''effacement. Delai de grace 7j (annulable), execution auto avant 1 mois. Pour un mineur : seul un titulaire legal peut demander.';

DROP POLICY IF EXISTS "View own erasure requests" ON public.erasure_requests;
CREATE POLICY "View own erasure requests" ON public.erasure_requests
  FOR SELECT TO authenticated
  USING (requested_by = auth.uid() OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Guardian requests minor erasure" ON public.erasure_requests;
CREATE POLICY "Guardian requests minor erasure" ON public.erasure_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    requested_by = auth.uid()
    AND (
      subject_profile_id = auth.uid()
      OR public.is_legal_guardian_of(auth.uid(), subject_profile_id)
    )
  );

DROP POLICY IF EXISTS "Cancel own pending erasure" ON public.erasure_requests;
CREATE POLICY "Cancel own pending erasure" ON public.erasure_requests
  FOR UPDATE TO authenticated
  USING (requested_by = auth.uid() AND status = 'pending')
  WITH CHECK (requested_by = auth.uid());

CREATE OR REPLACE FUNCTION public.get_my_children()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT pc.minor_profile_id
  FROM public.parental_consents pc
  WHERE pc.guardian_profile_id = auth.uid()
    AND pc.revoked_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.get_my_children() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_children() TO authenticated, service_role;

COMMENT ON FUNCTION public.get_my_children() IS
  'Phase 5 : liste des minor_profile_id dont auth.uid() est titulaire legal actif (parental_consents non revoque).';
