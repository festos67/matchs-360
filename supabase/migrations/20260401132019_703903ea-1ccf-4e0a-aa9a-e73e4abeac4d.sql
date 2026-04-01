
CREATE OR REPLACE FUNCTION public.notify_team_players_of_objective()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _member record;
  _team_name text;
BEGIN
  SELECT name INTO _team_name FROM public.teams WHERE id = NEW.team_id;

  FOR _member IN
    SELECT user_id FROM public.team_members
    WHERE team_id = NEW.team_id
      AND member_type IN ('player', 'coach')
      AND is_active = true
  LOOP
    INSERT INTO public.notifications (user_id, title, message, type, link)
    VALUES (
      _member.user_id,
      'Nouvel objectif',
      'Un nouvel objectif a été ajouté à l''équipe ' || _team_name || ' : ' || NEW.title,
      'objective',
      '/teams/' || NEW.team_id || '?tab=objectives'
    );
  END LOOP;

  RETURN NEW;
END;
$$;
