-- F-212 (2026-04-25) — Lock down admin_get_auth_users_bulk to super-admin / service_role only.
-- Previous version (migration 20260424145411) only checked that the caller had ANY club_admin
-- role, not that the requested UUIDs belonged to clubs they administer. A club_admin could
-- therefore dump email + last_sign_in_at for any user on the platform (super-admins included).
--
-- The only legitimate caller (supabase/functions/admin-users/index.ts → "list" action) invokes
-- this RPC through the service_role client, so REVOKE-ing authenticated does not break it.
-- We also harden the body with an in-function authorization check (defense in depth) in case
-- grants are ever loosened in a future migration.

CREATE OR REPLACE FUNCTION public.admin_get_auth_users_bulk(p_user_ids uuid[])
RETURNS TABLE(
  id uuid,
  email text,
  last_sign_in_at timestamptz,
  banned_until timestamptz,
  created_at timestamptz,
  email_confirmed_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- Authorization gate: only super-admins or service_role may call this.
  -- club_admins lost direct access (F-212). The edge function "admin-users"
  -- still works because it uses the service_role client.
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: admin_get_auth_users_bulk requires super-admin or service_role'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    au.id,
    au.email::text,
    au.last_sign_in_at,
    au.banned_until,
    au.created_at,
    au.email_confirmed_at
  FROM auth.users au
  WHERE au.id = ANY(p_user_ids);
END;
$$;

-- Lock down EXECUTE: revoke from public-facing roles, keep service_role only.
REVOKE ALL ON FUNCTION public.admin_get_auth_users_bulk(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.admin_get_auth_users_bulk(uuid[]) TO service_role;

COMMENT ON FUNCTION public.admin_get_auth_users_bulk(uuid[]) IS
  'F-212 fix (2026-04-25): caller must be service_role or super-admin. '
  'Previously any club_admin could dump email/last_sign_in_at of arbitrary users. '
  'Sole legitimate caller is the admin-users edge function (service_role).';
