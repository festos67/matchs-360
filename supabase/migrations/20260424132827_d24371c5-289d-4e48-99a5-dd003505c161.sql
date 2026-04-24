-- Coaches can update profiles of players in their teams
CREATE POLICY "Coaches update profiles of their players"
ON public.profiles
FOR UPDATE
USING (is_coach_of_player(auth.uid(), id))
WITH CHECK (is_coach_of_player(auth.uid(), id));

-- Coaches can update team_members for teams they coach (transfer / archive)
CREATE POLICY "Coaches update team_members in their teams"
ON public.team_members
FOR UPDATE
USING (is_coach_of_team(auth.uid(), team_id))
WITH CHECK (is_coach_of_team(auth.uid(), team_id));

-- Coaches can insert team_members (assign player to a new team during transfer)
CREATE POLICY "Coaches insert team_members in their teams"
ON public.team_members
FOR INSERT
WITH CHECK (is_coach_of_team(auth.uid(), team_id));