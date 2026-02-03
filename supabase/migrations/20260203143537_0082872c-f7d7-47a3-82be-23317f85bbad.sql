-- Create enum for evaluation type
CREATE TYPE public.evaluation_type AS ENUM ('coach_assessment', 'player_self_assessment');

-- Add type column to evaluations table with default value
ALTER TABLE public.evaluations 
ADD COLUMN type public.evaluation_type NOT NULL DEFAULT 'coach_assessment';

-- Update RLS policies for evaluations table to allow player self-assessments

-- Drop existing insert policy for coaches
DROP POLICY IF EXISTS "Coaches can create evaluations" ON public.evaluations;

-- Create new insert policy that allows both coaches and players
CREATE POLICY "Users can create evaluations"
ON public.evaluations
FOR INSERT
WITH CHECK (
  -- Coaches can create coach assessments for players in their teams
  (coach_id = auth.uid() AND type = 'coach_assessment')
  OR
  -- Players can create self-assessments for themselves only
  (player_id = auth.uid() AND type = 'player_self_assessment' AND coach_id = auth.uid())
);

-- Update select policy to include self-assessments visibility
DROP POLICY IF EXISTS "Coaches can view their evaluations" ON public.evaluations;

CREATE POLICY "Users can view evaluations"
ON public.evaluations
FOR SELECT
USING (
  -- User is the coach who created the evaluation
  coach_id = auth.uid()
  OR
  -- User is the player being evaluated (can see both types)
  player_id = auth.uid()
  OR
  -- Admin can see all
  is_admin(auth.uid())
  OR
  -- Coaches can see self-assessments of players in their teams
  (type = 'player_self_assessment' AND EXISTS (
    SELECT 1 FROM team_members tm1
    JOIN team_members tm2 ON tm1.team_id = tm2.team_id
    WHERE tm1.user_id = auth.uid()
    AND tm1.member_type = 'coach'
    AND tm1.is_active = true
    AND tm2.user_id = evaluations.player_id
    AND tm2.member_type = 'player'
    AND tm2.is_active = true
  ))
);

-- Update policy for updating evaluations (players can update their own self-assessments)
DROP POLICY IF EXISTS "Coaches can update their evaluations" ON public.evaluations;

CREATE POLICY "Users can update their evaluations"
ON public.evaluations
FOR UPDATE
USING (
  (coach_id = auth.uid() AND type = 'coach_assessment')
  OR
  (player_id = auth.uid() AND type = 'player_self_assessment' AND coach_id = auth.uid())
)
WITH CHECK (
  (coach_id = auth.uid() AND type = 'coach_assessment')
  OR
  (player_id = auth.uid() AND type = 'player_self_assessment' AND coach_id = auth.uid())
);

-- Drop the soft delete policy for coaches and recreate with player support
DROP POLICY IF EXISTS "Coaches can soft delete their evaluations" ON public.evaluations;

CREATE POLICY "Users can soft delete their evaluations"
ON public.evaluations
FOR UPDATE
USING (
  (coach_id = auth.uid())
  OR
  (player_id = auth.uid() AND type = 'player_self_assessment')
)
WITH CHECK (
  (coach_id = auth.uid())
  OR
  (player_id = auth.uid() AND type = 'player_self_assessment')
);

-- Update evaluation_scores policies to allow players to manage their self-assessment scores
DROP POLICY IF EXISTS "Coaches can manage evaluation scores" ON public.evaluation_scores;

CREATE POLICY "Users can manage evaluation scores"
ON public.evaluation_scores
FOR ALL
USING (
  evaluation_id IN (
    SELECT id FROM evaluations 
    WHERE (coach_id = auth.uid() AND type = 'coach_assessment')
    OR (player_id = auth.uid() AND type = 'player_self_assessment' AND coach_id = auth.uid())
  )
)
WITH CHECK (
  evaluation_id IN (
    SELECT id FROM evaluations 
    WHERE (coach_id = auth.uid() AND type = 'coach_assessment')
    OR (player_id = auth.uid() AND type = 'player_self_assessment' AND coach_id = auth.uid())
  )
);

-- Update evaluation_objectives policies similarly
DROP POLICY IF EXISTS "Coaches can manage evaluation objectives" ON public.evaluation_objectives;

CREATE POLICY "Users can manage evaluation objectives"
ON public.evaluation_objectives
FOR ALL
USING (
  evaluation_id IN (
    SELECT id FROM evaluations 
    WHERE (coach_id = auth.uid() AND type = 'coach_assessment')
    OR (player_id = auth.uid() AND type = 'player_self_assessment' AND coach_id = auth.uid())
  )
)
WITH CHECK (
  evaluation_id IN (
    SELECT id FROM evaluations 
    WHERE (coach_id = auth.uid() AND type = 'coach_assessment')
    OR (player_id = auth.uid() AND type = 'player_self_assessment' AND coach_id = auth.uid())
  )
);