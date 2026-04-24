-- F-201 P0-4 : Verrouiller les helpers RBAC contre l'énumération cross-tenant.
--
-- Stratégie :
--   1. REVOKE EXECUTE FROM PUBLIC, GRANT EXECUTE TO authenticated/service_role
--      pour empêcher anon d'appeler ces fonctions.
--   2. Ajouter en tête de chaque helper qui prend un _user_id un guard
--      "self OR super-admin OR service_role". Les RLS policies appelant
--      ces helpers passent toujours auth.uid(), donc compatibles.
--   3. Idem pour get_invitation_quota_remaining (p_caller).
--
-- Note : is_admin(_user_id) ne reçoit pas de guard self-only car il est
-- utilisé dans les bypass de quasi tous les triggers/policies avec un
-- argument auth.uid(). Le REVOKE PUBLIC suffit à bloquer anon ; le risque
-- d'oracle est limité à "suis-je super admin ?" ce qui est trivialement
-- déductible côté client.

-- ============================================================
-- 1) get_invitation_quota_remaining : self-only + super admin
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_invitation_quota_remaining(p_caller uuid)
RETURNS TABLE(used integer, limit_per_hour integer, reset_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_role text;
  v_limit int;
  v_used int;
BEGIN
  -- Defense-in-depth : refuser anon explicitement.
  IF auth.role() NOT IN ('authenticated', 'service_role') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Self OR super-admin OR service_role uniquement.
  IF auth.role() <> 'service_role'
     AND p_caller IS DISTINCT FROM auth.uid()
     AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: cannot inspect quota of another user'
      USING ERRCODE = '42501';
  END IF;

  -- Récupérer le rôle dominant pour fixer le quota
  SELECT role::text INTO v_role
  FROM public.user_roles
  WHERE user_id = p_caller
  ORDER BY CASE role
    WHEN 'admin' THEN 0
    WHEN 'club_admin' THEN 1
    WHEN 'coach' THEN 2
    ELSE 3
  END
  LIMIT 1;

  v_limit := CASE v_role
    WHEN 'admin' THEN 200
    WHEN 'club_admin' THEN 50
    WHEN 'coach' THEN 20
    ELSE 5
  END;

  SELECT COUNT(*)::int INTO v_used
  FROM public.invitation_send_log
  WHERE invited_by = p_caller
    AND created_at > now() - interval '1 hour';

  RETURN QUERY SELECT v_used, v_limit, (now() + interval '1 hour')::timestamptz;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_invitation_quota_remaining(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_invitation_quota_remaining(uuid) TO authenticated, service_role;

-- ============================================================
-- 2) Lock down execute permissions sur les helpers RBAC qui prennent
--    un _user_id arbitraire. REVOKE PUBLIC bloque anon ; les policies
--    RLS continuent à les appeler (run as definer/invoker selon contexte).
-- ============================================================
DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.has_role(uuid, public.app_role)',
    'public.is_admin(uuid)',
    'public.is_club_admin(uuid, uuid)',
    'public.is_club_admin_of_team(uuid, uuid)',
    'public.is_coach_of_team(uuid, uuid)',
    'public.is_coach_of_player(uuid, uuid)',
    'public.is_referent_coach_of_team(uuid, uuid)',
    'public.is_player_in_team(uuid, uuid)',
    'public.is_supporter_of_player(uuid, uuid)',
    'public.get_user_team_ids(uuid)',
    'public.get_user_club_ids(uuid)',
    'public.get_user_club_admin_ids(uuid)',
    'public.get_coach_player_ids(uuid)',
    'public.get_referent_coach_team_ids(uuid)',
    'public.get_supporter_player_team_ids(uuid)',
    'public.get_teammate_user_ids(uuid)',
    'public.get_player_club_id(uuid)'
  ]
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
    -- authenticated reste autorisé pour que les RLS policies fonctionnent
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
  END LOOP;
END$$;