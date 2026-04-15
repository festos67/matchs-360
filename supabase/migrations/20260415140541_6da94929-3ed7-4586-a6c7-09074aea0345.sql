
-- Fix supporters_link: replace policies that join team_members with SECURITY DEFINER calls
DROP POLICY IF EXISTS "Club admin manage supporters" ON public.supporters_link;
CREATE POLICY "Club admin manage supporters"
ON public.supporters_link FOR ALL TO authenticated
USING (is_club_admin(auth.uid(), get_player_club_id(player_id)))
WITH CHECK (is_club_admin(auth.uid(), get_player_club_id(player_id)));

-- Fix supporter_evaluation_requests: same pattern
DROP POLICY IF EXISTS "Club admins can manage supporter evaluation requests" ON public.supporter_evaluation_requests;
CREATE POLICY "Club admins can manage supporter evaluation requests"
ON public.supporter_evaluation_requests FOR ALL TO public
USING (is_club_admin(auth.uid(), get_player_club_id(player_id)))
WITH CHECK (is_club_admin(auth.uid(), get_player_club_id(player_id)));

-- Fix evaluations: Club admin view - use SECURITY DEFINER instead of joining team_members
DROP POLICY IF EXISTS "Club admins can view evaluations in their club" ON public.evaluations;
CREATE POLICY "Club admins can view evaluations in their club"
ON public.evaluations FOR SELECT TO public
USING (is_admin(auth.uid()) OR is_club_admin(auth.uid(), get_player_club_id(player_id)));

-- Fix evaluation_scores: same pattern
DROP POLICY IF EXISTS "Club admins can view evaluation scores in their club" ON public.evaluation_scores;
CREATE POLICY "Club admins can view evaluation scores in their club"
ON public.evaluation_scores FOR SELECT TO public
USING (
  is_admin(auth.uid()) OR
  EXISTS (
    SELECT 1 FROM evaluations e
    WHERE e.id = evaluation_scores.evaluation_id
      AND is_club_admin(auth.uid(), get_player_club_id(e.player_id))
  )
);

-- Fix evaluation_objectives: same pattern
DROP POLICY IF EXISTS "Club admins can view evaluation objectives in their club" ON public.evaluation_objectives;
CREATE POLICY "Club admins can view evaluation objectives in their club"
ON public.evaluation_objectives FOR SELECT TO public
USING (
  is_admin(auth.uid()) OR
  EXISTS (
    SELECT 1 FROM evaluations e
    WHERE e.id = evaluation_objectives.evaluation_id
      AND is_club_admin(auth.uid(), get_player_club_id(e.player_id))
  )
);
