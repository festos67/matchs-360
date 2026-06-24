-- Allow supporters to view evaluation_objectives for their linked players
-- (mirrors the existing supporter SELECT policies on evaluations and evaluation_scores).
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
