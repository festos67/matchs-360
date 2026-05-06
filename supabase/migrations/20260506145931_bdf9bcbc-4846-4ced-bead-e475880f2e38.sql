DROP POLICY IF EXISTS "Users can view evaluation scores" ON public.evaluation_scores;
CREATE POLICY "Users can view evaluation scores"
ON public.evaluation_scores
FOR SELECT
USING (
  (evaluation_id IN (
    SELECT evaluations.id FROM evaluations
    WHERE evaluations.evaluator_id = auth.uid()
       OR evaluations.player_id = auth.uid()
       OR (evaluations.type = ANY (ARRAY['coach'::evaluation_type, 'self'::evaluation_type, 'supporter'::evaluation_type])
           AND is_coach_of_player(auth.uid(), evaluations.player_id))
  )) OR is_admin(auth.uid())
);

DROP POLICY IF EXISTS "Users can view evaluation objectives" ON public.evaluation_objectives;
CREATE POLICY "Users can view evaluation objectives"
ON public.evaluation_objectives
FOR SELECT
USING (
  (evaluation_id IN (
    SELECT evaluations.id FROM evaluations
    WHERE evaluations.evaluator_id = auth.uid()
       OR evaluations.player_id = auth.uid()
       OR (evaluations.type = ANY (ARRAY['coach'::evaluation_type, 'self'::evaluation_type, 'supporter'::evaluation_type])
           AND is_coach_of_player(auth.uid(), evaluations.player_id))
  )) OR is_admin(auth.uid())
);