-- =====================================================================
-- Cycle 5 finding C5-6 — Rate-limit invitations bypass via 'status' filter
-- =====================================================================
-- Bug : get_invitation_quota_remaining filtrait COUNT(*) ... WHERE status = 'accepted'
--       → un attaquant qui spam des invitations qui finissent en 'rate_limited'
--         ou 'error' ne consomme jamais son quota (compteur reste à 0).
--
-- Fix M1 (rate-limit anti-spam, per-sender, fenêtre glissante 1h) :
--       compter TOUTES les tentatives loggées dans invitation_send_log,
--       peu importe leur status final ('accepted' | 'rate_limited' | 'error').
--       L'edge function send-invitation logge systématiquement chaque tentative
--       APRÈS la décision rate-limit, donc le compteur reflète exactement les
--       tentatives d'envoi consommées.
--
-- M2 (sièges plan / billing) reste séparée et inchangée :
--       elle vit dans get_club_plan / plan_limits / check_member_limit et
--       n'utilise PAS invitation_send_log. Aucune régression possible.
--
-- Idempotent (CREATE OR REPLACE).
-- =====================================================================

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

  -- C5-6 FIX : compter TOUTES les tentatives dans la fenêtre, pas seulement
  -- celles qui ont fini en 'accepted'. Sinon un attaquant qui spam et se fait
  -- rate-limit (status='rate_limited') ne voit jamais son compteur monter.
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

-- Préserver les grants (CREATE OR REPLACE les conserve mais on ré-affirme)
REVOKE EXECUTE ON FUNCTION public.get_invitation_quota_remaining(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_invitation_quota_remaining(uuid) TO authenticated, service_role;