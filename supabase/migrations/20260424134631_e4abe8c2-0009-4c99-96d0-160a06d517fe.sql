CREATE OR REPLACE FUNCTION public.get_invitation_quota_remaining(p_caller uuid)
 RETURNS TABLE(used integer, limit_per_hour integer, reset_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
  v_limit integer;
  v_used integer;
  v_oldest timestamptz;
BEGIN
  -- F-201 FIX : empêcher l'énumération du rôle et de l'activité d'invitations
  -- d'un autre utilisateur. Seul service_role ou le user lui-même peut interroger.
  IF auth.role() <> 'service_role' AND p_caller IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Forbidden: cannot query quota for another user'
      USING ERRCODE = '42501';
  END IF;

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
    AND created_at > now() - interval '1 hour';

  RETURN QUERY SELECT
    COALESCE(v_used, 0)::integer,
    v_limit,
    COALESCE(v_oldest + interval '1 hour', now() + interval '1 hour');
END;
$function$;