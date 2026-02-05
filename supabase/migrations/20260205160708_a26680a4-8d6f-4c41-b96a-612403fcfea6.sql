-- Create SECURITY DEFINER functions to avoid RLS recursion on team_members

-- Get team IDs where user is an active member
CREATE OR REPLACE FUNCTION public.get_user_team_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT team_id
  FROM public.team_members
  WHERE user_id = _user_id AND is_active = true;
$$;

-- Get team IDs where user is referent coach
CREATE OR REPLACE FUNCTION public.get_referent_coach_team_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT team_id
  FROM public.team_members
  WHERE user_id = _user_id 
    AND member_type = 'coach'
    AND coach_role = 'referent'
    AND is_active = true;
$$;

-- Get team IDs for supporter's linked players
CREATE OR REPLACE FUNCTION public.get_supporter_player_team_ids(_supporter_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT tm.team_id
  FROM public.supporters_link sl
  JOIN public.team_members tm ON tm.user_id = sl.player_id 
    AND tm.is_active = true 
    AND tm.member_type = 'player'
  WHERE sl.supporter_id = _supporter_id;
$$;

-- Get player IDs for a coach (players in teams where user is coach)
CREATE OR REPLACE FUNCTION public.get_coach_player_ids(_coach_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT tm_player.user_id
  FROM public.team_members tm_coach
  JOIN public.team_members tm_player ON tm_coach.team_id = tm_player.team_id
  WHERE tm_coach.user_id = _coach_id
    AND tm_coach.member_type = 'coach'
    AND tm_coach.is_active = true
    AND tm_player.member_type = 'player'
    AND tm_player.is_active = true;
$$;

-- Check if user is coach of a player
CREATE OR REPLACE FUNCTION public.is_coach_of_player(_coach_id uuid, _player_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_members tm_coach
    JOIN public.team_members tm_player ON tm_coach.team_id = tm_player.team_id
    WHERE tm_coach.user_id = _coach_id
      AND tm_coach.member_type = 'coach'
      AND tm_coach.is_active = true
      AND tm_player.user_id = _player_id
      AND tm_player.member_type = 'player'
      AND tm_player.is_active = true
  );
$$;

-- Fix competence_frameworks policies
DROP POLICY IF EXISTS "Coaches view their team framework" ON public.competence_frameworks;
DROP POLICY IF EXISTS "Supporters view framework of linked players" ON public.competence_frameworks;
DROP POLICY IF EXISTS "Team members view framework" ON public.competence_frameworks;

CREATE POLICY "Team members view framework"
ON public.competence_frameworks
AS PERMISSIVE FOR SELECT TO authenticated
USING (
  is_template = true
  OR team_id IN (SELECT public.get_user_team_ids(auth.uid()))
);

CREATE POLICY "Supporters view framework of linked players"
ON public.competence_frameworks
AS PERMISSIVE FOR SELECT TO authenticated
USING (
  team_id IN (SELECT public.get_supporter_player_team_ids(auth.uid()))
);

-- Fix evaluations policy
DROP POLICY IF EXISTS "Users can view evaluations" ON public.evaluations;

CREATE POLICY "Users can view evaluations"
ON public.evaluations
AS PERMISSIVE FOR SELECT TO authenticated
USING (
  coach_id = auth.uid()
  OR player_id = auth.uid()
  OR public.is_admin(auth.uid())
  OR (
    type = 'player_self_assessment'
    AND public.is_coach_of_player(auth.uid(), player_id)
  )
);

-- Fix skills policy
DROP POLICY IF EXISTS "Referent coach manage skills" ON public.skills;

CREATE POLICY "Referent coach manage skills"
ON public.skills
AS PERMISSIVE FOR ALL TO authenticated
USING (
  theme_id IN (
    SELECT th.id
    FROM public.themes th
    JOIN public.competence_frameworks cf ON th.framework_id = cf.id
    WHERE cf.team_id IN (SELECT public.get_referent_coach_team_ids(auth.uid()))
  )
)
WITH CHECK (
  theme_id IN (
    SELECT th.id
    FROM public.themes th
    JOIN public.competence_frameworks cf ON th.framework_id = cf.id
    WHERE cf.team_id IN (SELECT public.get_referent_coach_team_ids(auth.uid()))
  )
);

-- Fix themes policy
DROP POLICY IF EXISTS "Referent coach manage themes" ON public.themes;

CREATE POLICY "Referent coach manage themes"
ON public.themes
AS PERMISSIVE FOR ALL TO authenticated
USING (
  framework_id IN (
    SELECT cf.id
    FROM public.competence_frameworks cf
    WHERE cf.team_id IN (SELECT public.get_referent_coach_team_ids(auth.uid()))
  )
)
WITH CHECK (
  framework_id IN (
    SELECT cf.id
    FROM public.competence_frameworks cf
    WHERE cf.team_id IN (SELECT public.get_referent_coach_team_ids(auth.uid()))
  )
);

-- Fix supporters_link policy
DROP POLICY IF EXISTS "Coaches manage supporters for their players" ON public.supporters_link;

CREATE POLICY "Coaches manage supporters for their players"
ON public.supporters_link
AS PERMISSIVE FOR ALL TO authenticated
USING (
  player_id IN (SELECT public.get_coach_player_ids(auth.uid()))
)
WITH CHECK (
  player_id IN (SELECT public.get_coach_player_ids(auth.uid()))
);