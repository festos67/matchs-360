CREATE OR REPLACE FUNCTION public.check_team_limit()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_plan public.subscription_plan;
  v_limit INTEGER;
  v_count INTEGER;
BEGIN
  SELECT public.get_club_plan(NEW.club_id) INTO v_plan;
  SELECT max_teams INTO v_limit FROM public.plan_limits WHERE plan = v_plan;

  SELECT COUNT(*) INTO v_count
  FROM public.teams
  WHERE club_id = NEW.club_id AND deleted_at IS NULL;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'PLAN_LIMIT_TEAMS:Limite du plan % atteinte : % équipes maximum.', v_plan, v_limit;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_team_limit ON public.teams;

CREATE TRIGGER trg_check_team_limit
  BEFORE INSERT ON public.teams
  FOR EACH ROW
  EXECUTE FUNCTION public.check_team_limit();