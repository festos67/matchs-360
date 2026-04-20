CREATE OR REPLACE FUNCTION public.check_evaluation_limit()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_club_id UUID;
  v_plan public.subscription_plan;
  v_limits RECORD;
  v_count INTEGER;
  v_max INTEGER;
BEGIN
  SELECT t.club_id INTO v_club_id
  FROM public.team_members tm
  JOIN public.teams t ON tm.team_id = t.id
  WHERE tm.user_id = NEW.player_id
    AND tm.is_active = true
    AND tm.deleted_at IS NULL
  LIMIT 1;

  IF v_club_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT public.get_club_plan(v_club_id) INTO v_plan;
  SELECT * INTO v_limits FROM public.plan_limits WHERE plan = v_plan;

  v_max := CASE NEW.type
    WHEN 'coach' THEN v_limits.max_coach_evals_per_player
    WHEN 'self' THEN v_limits.max_self_evals_per_player
    WHEN 'supporter' THEN v_limits.max_supporter_evals_per_player
  END;

  SELECT COUNT(*) INTO v_count
  FROM public.evaluations
  WHERE player_id = NEW.player_id
    AND type = NEW.type
    AND deleted_at IS NULL;

  IF v_count >= v_max THEN
    RAISE EXCEPTION 'PLAN_LIMIT_EVALS:Limite du plan % atteinte : % évaluation(s) % par joueur maximum.', v_plan, v_max, NEW.type;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_evaluation_limit ON public.evaluations;

CREATE TRIGGER trg_check_evaluation_limit
  BEFORE INSERT ON public.evaluations
  FOR EACH ROW
  EXECUTE FUNCTION public.check_evaluation_limit();