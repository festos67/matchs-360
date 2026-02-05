-- Create SECURITY DEFINER function to get teammate user IDs (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.get_teammate_user_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT tm2.user_id
  FROM public.team_members tm1
  JOIN public.team_members tm2 ON tm1.team_id = tm2.team_id
  WHERE tm1.user_id = _user_id
    AND tm1.is_active = true
    AND tm2.is_active = true;
$$;

-- Drop and recreate the profiles SELECT policy without inline subquery on team_members
DROP POLICY IF EXISTS "Users view profiles in scope" ON public.profiles;

CREATE POLICY "Users view profiles in scope"
ON public.profiles
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (
  deleted_at IS NULL
  AND (
    id = auth.uid()
    OR club_id IN (SELECT public.get_user_club_ids(auth.uid()))
    OR id IN (SELECT public.get_teammate_user_ids(auth.uid()))
    OR public.is_supporter_of_player(auth.uid(), id)
  )
);