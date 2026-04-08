-- Ajouter deleted_at sur team_members
ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Mettre à jour les policies RLS sur team_members pour filtrer deleted_at IS NULL

-- Players view teammates
DROP POLICY IF EXISTS "Players view teammates in their team" ON public.team_members;
CREATE POLICY "Players view teammates in their team"
ON public.team_members FOR SELECT TO authenticated
USING (is_active = true AND deleted_at IS NULL AND team_id IN (SELECT get_user_team_ids(auth.uid())));

-- Supporters view team_members
DROP POLICY IF EXISTS "Supporters view team_members of linked players" ON public.team_members;
CREATE POLICY "Supporters view team_members of linked players"
ON public.team_members FOR SELECT TO authenticated
USING (is_active = true AND deleted_at IS NULL AND user_id IN (SELECT sl.player_id FROM supporters_link sl WHERE sl.supporter_id = auth.uid()));

-- Users view own membership
DROP POLICY IF EXISTS "Users can view own team membership" ON public.team_members;
CREATE POLICY "Users can view own team membership"
ON public.team_members FOR SELECT TO authenticated
USING (user_id = auth.uid() AND deleted_at IS NULL);