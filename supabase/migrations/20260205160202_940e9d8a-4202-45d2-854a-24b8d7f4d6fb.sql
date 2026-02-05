-- Remove team_members policies that can trigger infinite recursion (they depend on team_members membership checks)
-- Keep: admin, club admin, supporter policies.

DROP POLICY IF EXISTS "Coaches view team_members" ON public.team_members;
DROP POLICY IF EXISTS "Coaches manage players in their teams" ON public.team_members;
DROP POLICY IF EXISTS "Players view teammates" ON public.team_members;
