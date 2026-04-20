CREATE OR REPLACE FUNCTION public.check_member_limit()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_club_id UUID;
  v_plan public.subscription_plan;
  v_limits RECORD;
  v_count INTEGER;
BEGIN
  SELECT club_id INTO v_club_id FROM public.teams WHERE id = NEW.team_id;
  SELECT public.get_club_plan(v_club_id) INTO v_plan;
  SELECT * INTO v_limits FROM public.plan_limits WHERE plan = v_plan;

  IF NEW.member_type = 'player' THEN
    SELECT COUNT(*) INTO v_count
    FROM public.team_members
    WHERE team_id = NEW.team_id
      AND member_type = 'player'
      AND is_active = true
      AND deleted_at IS NULL;

    IF v_count >= v_limits.max_players_per_team THEN
      RAISE EXCEPTION 'PLAN_LIMIT_PLAYERS:Limite du plan % atteinte : % joueurs par équipe maximum.', v_plan, v_limits.max_players_per_team;
    END IF;

  ELSIF NEW.member_type = 'coach' THEN
    SELECT COUNT(*) INTO v_count
    FROM public.team_members
    WHERE team_id = NEW.team_id
      AND member_type = 'coach'
      AND is_active = true
      AND deleted_at IS NULL;

    IF v_count >= v_limits.max_coaches_per_team THEN
      RAISE EXCEPTION 'PLAN_LIMIT_COACHES:Limite du plan % atteinte : % coach(s) par équipe maximum. Passez en Pro pour ajouter des coachs assistants.', v_plan, v_limits.max_coaches_per_team;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_member_limit ON public.team_members;

CREATE TRIGGER trg_check_member_limit
  BEFORE INSERT ON public.team_members
  FOR EACH ROW
  EXECUTE FUNCTION public.check_member_limit();