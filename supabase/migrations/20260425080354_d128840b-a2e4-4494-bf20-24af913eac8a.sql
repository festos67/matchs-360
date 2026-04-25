BEGIN;

-- ============================================================
-- Nx-101 (2026-04-25) — Restauration de la clause TO authenticated
-- sur 6 policies créées sans target role explicite (régression
-- discipline F-105). Sémantique USING/WITH CHECK STRICTEMENT préservée
-- depuis pg_policies au moment du fix.
-- ============================================================

-- Policy 1 — evaluations / SELECT
DROP POLICY IF EXISTS "Users can view evaluations" ON public.evaluations;
CREATE POLICY "Users can view evaluations"
  ON public.evaluations
  FOR SELECT
  TO authenticated
  USING (
    evaluator_id = auth.uid()
    OR player_id = auth.uid()
    OR is_admin(auth.uid())
    OR (
      type = ANY (ARRAY['coach'::evaluation_type, 'self'::evaluation_type, 'supporter'::evaluation_type])
      AND is_coach_of_player(auth.uid(), player_id)
    )
  );
COMMENT ON POLICY "Users can view evaluations" ON public.evaluations IS
  'Nx-101 fix (2026-04-25): TO authenticated explicite (anciennement TO public par defaut). USING inchangee.';

-- Policy 2 — profiles / UPDATE
DROP POLICY IF EXISTS "Coaches update profiles of their players" ON public.profiles;
CREATE POLICY "Coaches update profiles of their players"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (is_coach_of_player(auth.uid(), id))
  WITH CHECK (is_coach_of_player(auth.uid(), id));
COMMENT ON POLICY "Coaches update profiles of their players" ON public.profiles IS
  'Nx-101 fix (2026-04-25): TO authenticated explicite. USING/WITH CHECK inchangees.';

-- Policy 3 — team_members / UPDATE
DROP POLICY IF EXISTS "Coaches update team_members in their teams" ON public.team_members;
CREATE POLICY "Coaches update team_members in their teams"
  ON public.team_members
  FOR UPDATE
  TO authenticated
  USING (is_coach_of_team(auth.uid(), team_id))
  WITH CHECK (is_coach_of_team(auth.uid(), team_id));
COMMENT ON POLICY "Coaches update team_members in their teams" ON public.team_members IS
  'Nx-101 fix (2026-04-25): TO authenticated explicite. USING/WITH CHECK inchangees.';

-- Policy 4 — team_members / INSERT
DROP POLICY IF EXISTS "Coaches insert team_members in their teams" ON public.team_members;
CREATE POLICY "Coaches insert team_members in their teams"
  ON public.team_members
  FOR INSERT
  TO authenticated
  WITH CHECK (is_coach_of_team(auth.uid(), team_id));
COMMENT ON POLICY "Coaches insert team_members in their teams" ON public.team_members IS
  'Nx-101 fix (2026-04-25): TO authenticated explicite. WITH CHECK inchangee.';

-- Policy 5 — user_roles / INSERT
DROP POLICY IF EXISTS "Club admin and coaches grant supporter role" ON public.user_roles;
CREATE POLICY "Club admin and coaches grant supporter role"
  ON public.user_roles
  FOR INSERT
  TO authenticated
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
COMMENT ON POLICY "Club admin and coaches grant supporter role" ON public.user_roles IS
  'Nx-101 fix (2026-04-25): TO authenticated explicite. WITH CHECK inchangee.';

-- Policy 6 — user_roles / SELECT
DROP POLICY IF EXISTS "Club admin and coaches view supporter roles" ON public.user_roles;
CREATE POLICY "Club admin and coaches view supporter roles"
  ON public.user_roles
  FOR SELECT
  TO authenticated
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
COMMENT ON POLICY "Club admin and coaches view supporter roles" ON public.user_roles IS
  'Nx-101 fix (2026-04-25): TO authenticated explicite. USING inchangee.';

COMMIT;