CREATE POLICY "Supporters can view evaluation objectives for linked players"
ON public.evaluation_objectives
FOR SELECT
TO authenticated
USING (
  evaluation_id IN (
    SELECT e.id FROM public.evaluations e
    WHERE is_supporter_of_player(auth.uid(), e.player_id)
      AND e.type <> 'self'::evaluation_type
  )
);