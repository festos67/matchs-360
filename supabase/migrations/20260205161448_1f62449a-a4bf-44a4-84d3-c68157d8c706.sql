-- Fix: Supporters should NOT see player self-assessments

-- Drop and recreate the policy to exclude player_self_assessment
DROP POLICY IF EXISTS "Supporters can view evaluations for their linked players" ON public.evaluations;

CREATE POLICY "Supporters can view evaluations for their linked players"
ON public.evaluations
FOR SELECT
TO authenticated
USING (
  is_supporter_of_player(auth.uid(), player_id)
  AND type != 'player_self_assessment'
);

-- Also fix evaluation_scores policy to exclude self-assessments
DROP POLICY IF EXISTS "Supporters can view evaluation scores for linked players" ON public.evaluation_scores;

CREATE POLICY "Supporters can view evaluation scores for linked players"
ON public.evaluation_scores
FOR SELECT
TO authenticated
USING (
  evaluation_id IN (
    SELECT id FROM evaluations
    WHERE is_supporter_of_player(auth.uid(), player_id)
      AND type != 'player_self_assessment'
  )
);
