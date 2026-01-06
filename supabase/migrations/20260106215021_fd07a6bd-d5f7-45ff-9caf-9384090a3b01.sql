-- 1. Create SECURITY DEFINER function to get club_admin club IDs without triggering RLS
CREATE OR REPLACE FUNCTION public.get_user_club_admin_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT club_id 
  FROM public.user_roles 
  WHERE user_id = _user_id 
    AND role = 'club_admin' 
    AND club_id IS NOT NULL
$$;

-- 2. Drop the problematic policy that causes infinite recursion
DROP POLICY IF EXISTS "Club admin manage roles in club" ON public.user_roles;

-- 3. Recreate the policy using the SECURITY DEFINER function
CREATE POLICY "Club admin manage roles in club"
ON public.user_roles
FOR ALL
TO authenticated
USING (
  role <> 'admin' 
  AND club_id IN (SELECT public.get_user_club_admin_ids(auth.uid()))
)
WITH CHECK (
  role <> 'admin' 
  AND club_id IN (SELECT public.get_user_club_admin_ids(auth.uid()))
);