-- F-402: secure email lookup RPC to replace auth.admin.listUsers() (which defaults to first 50 users only).
-- SECURITY DEFINER with locked search_path; returns at most one row by exact lowercase email match.
-- Read-only on auth.users; not exposed to anon/authenticated (only service_role can call it).
CREATE OR REPLACE FUNCTION public.admin_get_user_by_email(p_email text)
RETURNS TABLE(id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  RETURN QUERY
  SELECT u.id
  FROM auth.users u
  WHERE lower(u.email) = lower(p_email)
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_user_by_email(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_user_by_email(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_user_by_email(text) TO service_role;