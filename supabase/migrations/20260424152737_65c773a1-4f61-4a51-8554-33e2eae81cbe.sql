-- F-201 — Block IDOR in get_invitation_quota_remaining
-- Force p_caller to equal auth.uid() (service_role bypass kept for edge functions).
-- Body of the function preserved verbatim.

CREATE OR REPLACE FUNCTION public.get_invitation_quota_remaining(p_caller uuid)
RETURNS TABLE(used integer, limit_per_hour integer, reset_at timestamp with time zone)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_limit int;
  v_used int;
  v_reset timestamptz;
BEGIN
  -- Authorization guard: only the caller themselves (or service_role) may query.
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND (auth.uid() IS NULL OR p_caller IS DISTINCT FROM auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: cannot query invitation quota for another user'
      USING ERRCODE = '42501';
  END IF;

  -- Determine per-hour limit based on caller's highest role
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_caller AND role = 'admin') THEN
    v_limit := 500;
  ELSIF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_caller AND role = 'club_admin') THEN
    v_limit := 100;
  ELSIF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_caller AND role = 'coach') THEN
    v_limit := 30;
  ELSE
    v_limit := 0;
  END IF;

  SELECT COUNT(*)::int, MIN(created_at)
    INTO v_used, v_reset
    FROM public.invitation_send_log
   WHERE invited_by = p_caller
     AND created_at > now() - interval '1 hour';

  used := COALESCE(v_used, 0);
  limit_per_hour := v_limit;
  reset_at := COALESCE(v_reset, now()) + interval '1 hour';
  RETURN NEXT;
END;
$$;

-- Re-affirm grants (no change in surface, just hardened body)
REVOKE ALL ON FUNCTION public.get_invitation_quota_remaining(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_invitation_quota_remaining(uuid) TO authenticated, service_role;