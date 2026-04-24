CREATE OR REPLACE FUNCTION public.admin_get_auth_users_bulk(p_user_ids uuid[])
RETURNS TABLE(
  id uuid,
  email text,
  last_sign_in_at timestamptz,
  banned_until timestamptz,
  created_at timestamptz,
  email_confirmed_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    au.id,
    au.email::text,
    au.last_sign_in_at,
    au.banned_until,
    au.created_at,
    au.email_confirmed_at
  FROM auth.users au
  WHERE au.id = ANY(p_user_ids)
    AND (
      public.is_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid() AND ur.role = 'club_admin'
      )
    );
$$;

REVOKE ALL ON FUNCTION public.admin_get_auth_users_bulk(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_auth_users_bulk(uuid[]) TO authenticated, service_role;