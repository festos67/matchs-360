-- Allow club admins and coaches to insert the 'supporter' role for users in their club
CREATE POLICY "Club admin and coaches grant supporter role"
ON public.user_roles
FOR INSERT
WITH CHECK (
  role = 'supporter'::app_role
  AND club_id IS NOT NULL
  AND (
    is_club_admin(auth.uid(), club_id)
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
      JOIN public.teams t ON t.id = tm.team_id
      WHERE tm.user_id = auth.uid()
        AND tm.member_type = 'coach'
        AND tm.is_active = true
        AND tm.deleted_at IS NULL
        AND t.club_id = user_roles.club_id
    )
  )
);

-- Allow club admins and coaches to view supporter roles within their club (idempotent checks)
CREATE POLICY "Club admin and coaches view supporter roles"
ON public.user_roles
FOR SELECT
USING (
  role = 'supporter'::app_role
  AND club_id IS NOT NULL
  AND (
    is_club_admin(auth.uid(), club_id)
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
      JOIN public.teams t ON t.id = tm.team_id
      WHERE tm.user_id = auth.uid()
        AND tm.member_type = 'coach'
        AND tm.is_active = true
        AND tm.deleted_at IS NULL
        AND t.club_id = user_roles.club_id
    )
  )
);