
-- get_user_team_ids: add deleted_at IS NULL
CREATE OR REPLACE FUNCTION public.get_user_team_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT team_id FROM public.team_members
  WHERE user_id = _user_id AND is_active = true AND deleted_at IS NULL;
$$;

-- is_coach_of_team: add deleted_at IS NULL
CREATE OR REPLACE FUNCTION public.is_coach_of_team(_user_id uuid, _team_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE user_id = _user_id
      AND team_id = _team_id
      AND member_type = 'coach'
      AND is_active = true
      AND deleted_at IS NULL
  );
$$;

-- is_player_in_team: add deleted_at IS NULL
CREATE OR REPLACE FUNCTION public.is_player_in_team(_user_id uuid, _team_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE user_id = _user_id
      AND team_id = _team_id
      AND member_type = 'player'
      AND is_active = true
      AND deleted_at IS NULL
  );
$$;

-- is_referent_coach_of_team: add deleted_at IS NULL
CREATE OR REPLACE FUNCTION public.is_referent_coach_of_team(_user_id uuid, _team_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE user_id = _user_id
      AND team_id = _team_id
      AND member_type = 'coach'
      AND coach_role = 'referent'
      AND is_active = true
      AND deleted_at IS NULL
  );
$$;

-- is_coach_of_player: add deleted_at IS NULL on both sides
CREATE OR REPLACE FUNCTION public.is_coach_of_player(_coach_id uuid, _player_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_members tm_coach
    JOIN public.team_members tm_player ON tm_coach.team_id = tm_player.team_id
    WHERE tm_coach.user_id = _coach_id
      AND tm_coach.member_type = 'coach'
      AND tm_coach.is_active = true
      AND tm_coach.deleted_at IS NULL
      AND tm_player.user_id = _player_id
      AND tm_player.member_type = 'player'
      AND tm_player.is_active = true
      AND tm_player.deleted_at IS NULL
  );
$$;

-- get_coach_player_ids: add deleted_at IS NULL
CREATE OR REPLACE FUNCTION public.get_coach_player_ids(_coach_id uuid)
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT tm_player.user_id
  FROM public.team_members tm_coach
  JOIN public.team_members tm_player ON tm_coach.team_id = tm_player.team_id
  WHERE tm_coach.user_id = _coach_id
    AND tm_coach.member_type = 'coach'
    AND tm_coach.is_active = true
    AND tm_coach.deleted_at IS NULL
    AND tm_player.member_type = 'player'
    AND tm_player.is_active = true
    AND tm_player.deleted_at IS NULL;
$$;

-- get_teammate_user_ids: add deleted_at IS NULL
CREATE OR REPLACE FUNCTION public.get_teammate_user_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT tm2.user_id
  FROM public.team_members tm1
  JOIN public.team_members tm2 ON tm1.team_id = tm2.team_id
  WHERE tm1.user_id = _user_id
    AND tm1.is_active = true
    AND tm1.deleted_at IS NULL
    AND tm2.is_active = true
    AND tm2.deleted_at IS NULL;
$$;

-- get_referent_coach_team_ids: add deleted_at IS NULL
CREATE OR REPLACE FUNCTION public.get_referent_coach_team_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT team_id FROM public.team_members
  WHERE user_id = _user_id
    AND member_type = 'coach'
    AND coach_role = 'referent'
    AND is_active = true
    AND deleted_at IS NULL;
$$;

-- get_supporter_player_team_ids: add deleted_at IS NULL
CREATE OR REPLACE FUNCTION public.get_supporter_player_team_ids(_supporter_id uuid)
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT tm.team_id
  FROM public.supporters_link sl
  JOIN public.team_members tm ON tm.user_id = sl.player_id
    AND tm.is_active = true
    AND tm.member_type = 'player'
    AND tm.deleted_at IS NULL
  WHERE sl.supporter_id = _supporter_id;
$$;

-- notify_team_on_new_objective: add deleted_at IS NULL
CREATE OR REPLACE FUNCTION public.notify_team_on_new_objective()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _player record;
  _team_name text;
BEGIN
  SELECT name INTO _team_name FROM public.teams WHERE id = NEW.team_id;
  FOR _player IN
    SELECT user_id FROM public.team_members
    WHERE team_id = NEW.team_id
      AND member_type = 'player'
      AND is_active = true
      AND deleted_at IS NULL
  LOOP
    INSERT INTO public.notifications (user_id, title, message, type, link)
    VALUES (
      _player.user_id,
      'Nouvel objectif',
      'Un nouvel objectif a été ajouté à l''équipe ' || _team_name || ' : ' || NEW.title,
      'objective',
      '/teams/' || NEW.team_id
    );
  END LOOP;
  RETURN NEW;
END;
$$;

-- notify_team_players_of_objective: add deleted_at IS NULL
CREATE OR REPLACE FUNCTION public.notify_team_players_of_objective()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
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
      AND deleted_at IS NULL
      AND user_id <> NEW.created_by
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
