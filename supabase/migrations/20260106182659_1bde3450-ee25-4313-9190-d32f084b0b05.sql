-- Add soft delete columns to main tables
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Add archived flag to team_members for mutation history
ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS archived_reason TEXT DEFAULT NULL;

-- Create index for performance on soft delete queries
CREATE INDEX IF NOT EXISTS idx_profiles_deleted_at ON public.profiles(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_teams_deleted_at ON public.teams(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_clubs_deleted_at ON public.clubs(deleted_at) WHERE deleted_at IS NULL;

-- Update RLS policies to exclude soft-deleted records for normal queries
-- Drop and recreate the profiles SELECT policy
DROP POLICY IF EXISTS "Users view profiles in scope" ON public.profiles;
CREATE POLICY "Users view profiles in scope" ON public.profiles
FOR SELECT TO authenticated
USING (
  deleted_at IS NULL AND (
    (id = auth.uid()) OR 
    (club_id IN (SELECT get_user_club_ids(auth.uid()))) OR 
    (id IN (
      SELECT tm2.user_id
      FROM team_members tm1
      JOIN team_members tm2 ON (tm1.team_id = tm2.team_id)
      WHERE tm1.user_id = auth.uid() AND tm1.is_active = true AND tm2.is_active = true
    )) OR 
    is_supporter_of_player(auth.uid(), id)
  )
);

-- Update teams SELECT policies
DROP POLICY IF EXISTS "Coaches view their teams" ON public.teams;
CREATE POLICY "Coaches view their teams" ON public.teams
FOR SELECT TO authenticated
USING (deleted_at IS NULL AND is_coach_of_team(auth.uid(), id));

DROP POLICY IF EXISTS "Players view their team" ON public.teams;
CREATE POLICY "Players view their team" ON public.teams
FOR SELECT TO authenticated
USING (deleted_at IS NULL AND is_player_in_team(auth.uid(), id));

-- Update clubs SELECT policy
DROP POLICY IF EXISTS "Club admin view their club" ON public.clubs;
CREATE POLICY "Club admin view their club" ON public.clubs
FOR SELECT TO authenticated
USING (deleted_at IS NULL AND id IN (SELECT get_user_club_ids(auth.uid())));