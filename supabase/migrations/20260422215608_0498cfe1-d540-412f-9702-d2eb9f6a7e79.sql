-- Étendre la visibilité des évaluations pour les coachs : ils peuvent voir
-- toutes les évaluations (coach + self) de leurs joueurs, et pas uniquement
-- les leurs ou les self.

DROP POLICY IF EXISTS "Users can view evaluations" ON public.evaluations;

CREATE POLICY "Users can view evaluations"
ON public.evaluations
FOR SELECT
TO authenticated
USING (
  evaluator_id = auth.uid()
  OR player_id = auth.uid()
  OR is_admin(auth.uid())
  OR (type IN ('coach'::evaluation_type, 'self'::evaluation_type)
      AND is_coach_of_player(auth.uid(), player_id))
);

-- Étendre l'accès aux scores associés
DROP POLICY IF EXISTS "Users can view evaluation scores" ON public.evaluation_scores;

CREATE POLICY "Users can view evaluation scores"
ON public.evaluation_scores
FOR SELECT
TO authenticated
USING (
  evaluation_id IN (
    SELECT id FROM public.evaluations
    WHERE evaluator_id = auth.uid()
       OR player_id = auth.uid()
       OR (type IN ('coach'::evaluation_type, 'self'::evaluation_type)
           AND is_coach_of_player(auth.uid(), player_id))
  )
  OR is_admin(auth.uid())
);

-- Étendre l'accès aux objectifs associés
DROP POLICY IF EXISTS "Users can view evaluation objectives" ON public.evaluation_objectives;

CREATE POLICY "Users can view evaluation objectives"
ON public.evaluation_objectives
FOR SELECT
TO authenticated
USING (
  evaluation_id IN (
    SELECT id FROM public.evaluations
    WHERE evaluator_id = auth.uid()
       OR player_id = auth.uid()
       OR (type IN ('coach'::evaluation_type, 'self'::evaluation_type)
           AND is_coach_of_player(auth.uid(), player_id))
  )
  OR is_admin(auth.uid())
);