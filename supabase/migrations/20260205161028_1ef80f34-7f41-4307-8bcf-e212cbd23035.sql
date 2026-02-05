-- Fix supporter access to teams/clubs used by supporter evaluation flow

-- TEAMS: allow supporters to read teams of players they are linked to
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Supporters can view linked teams" ON public.teams;
CREATE POLICY "Supporters can view linked teams"
ON public.teams
FOR SELECT
TO authenticated
USING (
  id IN (SELECT public.get_supporter_player_team_ids(auth.uid()))
);

-- CLUBS: allow supporters to read clubs for those teams
ALTER TABLE public.clubs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Supporters can view linked clubs" ON public.clubs;
CREATE POLICY "Supporters can view linked clubs"
ON public.clubs
FOR SELECT
TO authenticated
USING (
  id IN (
    SELECT t.club_id
    FROM public.teams t
    WHERE t.id IN (SELECT public.get_supporter_player_team_ids(auth.uid()))
  )
);
