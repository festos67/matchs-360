DROP POLICY IF EXISTS "Users can view evaluations" ON public.evaluations;

CREATE POLICY "Users can view evaluations"
ON public.evaluations
FOR SELECT
USING (
  evaluator_id = auth.uid()
  OR player_id = auth.uid()
  OR is_admin(auth.uid())
  OR (
    type = ANY (ARRAY['coach'::evaluation_type, 'self'::evaluation_type, 'supporter'::evaluation_type])
    AND is_coach_of_player(auth.uid(), player_id)
  )
);