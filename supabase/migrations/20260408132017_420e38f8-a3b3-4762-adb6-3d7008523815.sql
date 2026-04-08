
-- 1. Rename the column
ALTER TABLE public.evaluations RENAME COLUMN coach_id TO evaluator_id;

-- 2. Drop and recreate all RLS policies on evaluations that reference coach_id

-- Policy: Users can create evaluations
DROP POLICY IF EXISTS "Users can create evaluations" ON public.evaluations;
CREATE POLICY "Users can create evaluations" ON public.evaluations
  FOR INSERT TO public
  WITH CHECK (
    ((evaluator_id = auth.uid()) AND (type = 'coach_assessment'::evaluation_type))
    OR ((player_id = auth.uid()) AND (type = 'player_self_assessment'::evaluation_type) AND (evaluator_id = auth.uid()))
  );

-- Policy: Users can update their evaluations
DROP POLICY IF EXISTS "Users can update their evaluations" ON public.evaluations;
CREATE POLICY "Users can update their evaluations" ON public.evaluations
  FOR UPDATE TO public
  USING (
    ((evaluator_id = auth.uid()) AND (type = 'coach_assessment'::evaluation_type))
    OR ((player_id = auth.uid()) AND (type = 'player_self_assessment'::evaluation_type) AND (evaluator_id = auth.uid()))
  )
  WITH CHECK (
    ((evaluator_id = auth.uid()) AND (type = 'coach_assessment'::evaluation_type))
    OR ((player_id = auth.uid()) AND (type = 'player_self_assessment'::evaluation_type) AND (evaluator_id = auth.uid()))
  );

-- Policy: Users can soft delete their evaluations
DROP POLICY IF EXISTS "Users can soft delete their evaluations" ON public.evaluations;
CREATE POLICY "Users can soft delete their evaluations" ON public.evaluations
  FOR UPDATE TO public
  USING (
    (evaluator_id = auth.uid()) OR ((player_id = auth.uid()) AND (type = 'player_self_assessment'::evaluation_type))
  )
  WITH CHECK (
    (evaluator_id = auth.uid()) OR ((player_id = auth.uid()) AND (type = 'player_self_assessment'::evaluation_type))
  );

-- Policy: Users can view evaluations
DROP POLICY IF EXISTS "Users can view evaluations" ON public.evaluations;
CREATE POLICY "Users can view evaluations" ON public.evaluations
  FOR SELECT TO authenticated
  USING (
    (evaluator_id = auth.uid()) OR (player_id = auth.uid()) OR is_admin(auth.uid())
    OR ((type = 'player_self_assessment'::evaluation_type) AND is_coach_of_player(auth.uid(), player_id))
  );

-- Policy: Supporters can create evaluations for their linked players
DROP POLICY IF EXISTS "Supporters can create evaluations for their linked players" ON public.evaluations;
CREATE POLICY "Supporters can create evaluations for their linked players" ON public.evaluations
  FOR INSERT TO public
  WITH CHECK (
    (type = 'supporter_assessment'::evaluation_type)
    AND (evaluator_id = auth.uid())
    AND is_supporter_of_player(auth.uid(), player_id)
  );

-- Policy: Supporters can update their own evaluations
DROP POLICY IF EXISTS "Supporters can update their own evaluations" ON public.evaluations;
CREATE POLICY "Supporters can update their own evaluations" ON public.evaluations
  FOR UPDATE TO public
  USING (
    (type = 'supporter_assessment'::evaluation_type)
    AND (evaluator_id = auth.uid())
    AND is_supporter_of_player(auth.uid(), player_id)
  )
  WITH CHECK (
    (type = 'supporter_assessment'::evaluation_type)
    AND (evaluator_id = auth.uid())
    AND is_supporter_of_player(auth.uid(), player_id)
  );

-- Policy: Supporters can view evaluations for their linked players (no coach_id ref, OK as-is)

-- 3. Update RLS policies on evaluation_scores that reference evaluations.coach_id

DROP POLICY IF EXISTS "Users can manage evaluation scores" ON public.evaluation_scores;
CREATE POLICY "Users can manage evaluation scores" ON public.evaluation_scores
  FOR ALL TO public
  USING (
    evaluation_id IN (
      SELECT id FROM evaluations
      WHERE ((evaluator_id = auth.uid()) AND (type = 'coach_assessment'::evaluation_type))
        OR ((player_id = auth.uid()) AND (type = 'player_self_assessment'::evaluation_type) AND (evaluator_id = auth.uid()))
    )
  )
  WITH CHECK (
    evaluation_id IN (
      SELECT id FROM evaluations
      WHERE ((evaluator_id = auth.uid()) AND (type = 'coach_assessment'::evaluation_type))
        OR ((player_id = auth.uid()) AND (type = 'player_self_assessment'::evaluation_type) AND (evaluator_id = auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Users can view evaluation scores" ON public.evaluation_scores;
CREATE POLICY "Users can view evaluation scores" ON public.evaluation_scores
  FOR SELECT TO authenticated
  USING (
    (evaluation_id IN (
      SELECT id FROM evaluations
      WHERE (evaluator_id = auth.uid()) OR (player_id = auth.uid())
    )) OR is_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Supporters can manage their evaluation scores" ON public.evaluation_scores;
CREATE POLICY "Supporters can manage their evaluation scores" ON public.evaluation_scores
  FOR ALL TO public
  USING (
    evaluation_id IN (
      SELECT id FROM evaluations
      WHERE (type = 'supporter_assessment'::evaluation_type) AND (evaluator_id = auth.uid())
    )
  )
  WITH CHECK (
    evaluation_id IN (
      SELECT id FROM evaluations
      WHERE (type = 'supporter_assessment'::evaluation_type) AND (evaluator_id = auth.uid())
    )
  );

-- 4. Update RLS policies on evaluation_objectives that reference evaluations.coach_id

DROP POLICY IF EXISTS "Users can manage evaluation objectives" ON public.evaluation_objectives;
CREATE POLICY "Users can manage evaluation objectives" ON public.evaluation_objectives
  FOR ALL TO public
  USING (
    evaluation_id IN (
      SELECT id FROM evaluations
      WHERE ((evaluator_id = auth.uid()) AND (type = 'coach_assessment'::evaluation_type))
        OR ((player_id = auth.uid()) AND (type = 'player_self_assessment'::evaluation_type) AND (evaluator_id = auth.uid()))
    )
  )
  WITH CHECK (
    evaluation_id IN (
      SELECT id FROM evaluations
      WHERE ((evaluator_id = auth.uid()) AND (type = 'coach_assessment'::evaluation_type))
        OR ((player_id = auth.uid()) AND (type = 'player_self_assessment'::evaluation_type) AND (evaluator_id = auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Users can view evaluation objectives" ON public.evaluation_objectives;
CREATE POLICY "Users can view evaluation objectives" ON public.evaluation_objectives
  FOR SELECT TO authenticated
  USING (
    (evaluation_id IN (
      SELECT id FROM evaluations
      WHERE (evaluator_id = auth.uid()) OR (player_id = auth.uid())
    )) OR is_admin(auth.uid())
  );
