-- Restrict the "coach grants supporter role" permission to coach référents only.
-- Club admins keep full access via the existing policy.
DROP POLICY IF EXISTS "Club admin and coaches grant supporter role" ON public.user_roles;

CREATE POLICY "Club admin and referent coaches grant supporter role"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  role = 'supporter'::app_role
  AND club_id IS NOT NULL
  AND (
    is_club_admin(auth.uid(), club_id)
    OR EXISTS (
      SELECT 1
      FROM team_members tm
      JOIN teams t ON t.id = tm.team_id
      WHERE tm.user_id = auth.uid()
        AND tm.member_type = 'coach'
        AND tm.coach_role = 'referent'
        AND tm.is_active = true
        AND tm.deleted_at IS NULL
        AND t.club_id = user_roles.club_id
    )
  )
);