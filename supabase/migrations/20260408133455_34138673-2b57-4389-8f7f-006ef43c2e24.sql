-- Un seul lien actif par utilisateur-équipe
CREATE UNIQUE INDEX unique_active_team_member
ON public.team_members (user_id, team_id)
WHERE left_at IS NULL;

-- Un seul lien supporter-joueur
ALTER TABLE public.supporters_link
ADD CONSTRAINT unique_supporter_player UNIQUE (supporter_id, player_id);