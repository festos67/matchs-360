
-- Contrainte 1: Un joueur ne peut être que dans UNE SEULE équipe active
-- Utilise un index unique partiel sur (user_id, member_type) où is_active = true et member_type = 'player'
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_player_per_team 
ON public.team_members (user_id) 
WHERE member_type = 'player' AND is_active = true;

-- Contrainte 2: Max 1 coach référent par équipe
-- Utilise un index unique partiel sur (team_id) où coach_role = 'referent' et is_active = true
CREATE UNIQUE INDEX IF NOT EXISTS unique_referent_coach_per_team 
ON public.team_members (team_id) 
WHERE coach_role = 'referent' AND is_active = true;
