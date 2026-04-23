-- =====================================================================
-- Cycle 4 finding (TRIPLE TRIANGULÉ): rate-limit applicatif send-invitation
-- =====================================================================
-- Crée :
--   1. Table append-only invitation_send_log (forensic + compteur quota)
--   2. RPC get_invitation_quota_remaining (sliding window 1h, quotas par rôle)
--   3. Purge > 30 jours
--   4. Audit trigger (cohérence avec les 9 autres tables sensibles)
-- Quotas hardcodés : admin=500/h, club_admin=100/h, coach=30/h, autres=10/h.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.invitation_send_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  invited_by uuid NOT NULL,
  caller_role text NOT NULL,
  club_id uuid NOT NULL,
  intended_role text NOT NULL,
  recipient_email_hash text NOT NULL,
  status text NOT NULL CHECK (status IN ('accepted','rate_limited','error')),
  error_message text
);

CREATE INDEX IF NOT EXISTS idx_inv_send_log_invited_by_created
  ON public.invitation_send_log (invited_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inv_send_log_created
  ON public.invitation_send_log (created_at DESC);

ALTER TABLE public.invitation_send_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read invitation_send_log" ON public.invitation_send_log;
CREATE POLICY "Admins can read invitation_send_log"
  ON public.invitation_send_log
  FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated can insert own invitation_send_log" ON public.invitation_send_log;
CREATE POLICY "Authenticated can insert own invitation_send_log"
  ON public.invitation_send_log
  FOR INSERT
  TO authenticated
  WITH CHECK (invited_by = auth.uid());

REVOKE UPDATE, DELETE ON public.invitation_send_log FROM authenticated, anon;

-- Audit trigger (append-only mais on garde la trace dans audit_log par cohérence)
DROP TRIGGER IF EXISTS trg_audit_invitation_send_log ON public.invitation_send_log;
CREATE TRIGGER trg_audit_invitation_send_log
  AFTER INSERT OR UPDATE OR DELETE ON public.invitation_send_log
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

-- =====================================================================
-- RPC get_invitation_quota_remaining
-- =====================================================================
CREATE OR REPLACE FUNCTION public.get_invitation_quota_remaining(p_caller uuid)
RETURNS TABLE(used integer, limit_per_hour integer, reset_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_limit integer;
  v_used integer;
  v_oldest timestamptz;
BEGIN
  -- Rôle effectif (priorité admin > club_admin > coach > autres)
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_caller AND role = 'admin') THEN 'admin'
    WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_caller AND role = 'club_admin') THEN 'club_admin'
    WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_caller AND role = 'coach') THEN 'coach'
    ELSE 'other'
  END INTO v_role;

  v_limit := CASE v_role
    WHEN 'admin' THEN 500
    WHEN 'club_admin' THEN 100
    WHEN 'coach' THEN 30
    ELSE 10
  END;

  SELECT COUNT(*), MIN(created_at)
    INTO v_used, v_oldest
  FROM public.invitation_send_log
  WHERE invited_by = p_caller
    AND status = 'accepted'
    AND created_at > now() - interval '1 hour';

  RETURN QUERY SELECT
    COALESCE(v_used, 0)::integer,
    v_limit,
    COALESCE(v_oldest + interval '1 hour', now() + interval '1 hour');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_invitation_quota_remaining(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_invitation_quota_remaining(uuid) TO authenticated, service_role;

-- =====================================================================
-- Purge > 30 jours (à brancher sur pg_cron ultérieurement)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.purge_old_invitation_send_log()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: purge requires service_role or admin'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.invitation_send_log
  WHERE created_at < now() - interval '30 days';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.purge_old_invitation_send_log() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_old_invitation_send_log() TO service_role;