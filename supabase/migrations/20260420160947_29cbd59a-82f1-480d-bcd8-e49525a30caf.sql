-- Fonction pour objectifs joueur
CREATE OR REPLACE FUNCTION public.check_player_objective_limit()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_plan public.subscription_plan;
  v_limit INTEGER;
  v_count INTEGER;
BEGIN
  SELECT public.get_club_plan(
    (SELECT club_id FROM public.teams WHERE id = NEW.team_id)
  ) INTO v_plan;
  SELECT max_objectives_per_player INTO v_limit FROM public.plan_limits WHERE plan = v_plan;

  SELECT COUNT(*) INTO v_count
  FROM public.player_objectives
  WHERE player_id = NEW.player_id
    AND team_id = NEW.team_id;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'PLAN_LIMIT_OBJ:Limite du plan % atteinte : % objectif(s) par joueur maximum.', v_plan, v_limit;
  END IF;

  RETURN NEW;
END;
$$;

-- Fonction pour objectifs équipe
CREATE OR REPLACE FUNCTION public.check_team_objective_limit()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_plan public.subscription_plan;
  v_limit INTEGER;
  v_count INTEGER;
BEGIN
  SELECT public.get_club_plan(
    (SELECT club_id FROM public.teams WHERE id = NEW.team_id)
  ) INTO v_plan;
  SELECT max_team_objectives INTO v_limit FROM public.plan_limits WHERE plan = v_plan;

  SELECT COUNT(*) INTO v_count
  FROM public.team_objectives
  WHERE team_id = NEW.team_id;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'PLAN_LIMIT_OBJ:Limite du plan % atteinte : % objectif(s) d''équipe maximum.', v_plan, v_limit;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_player_objective_limit ON public.player_objectives;
CREATE TRIGGER trg_check_player_objective_limit
  BEFORE INSERT ON public.player_objectives
  FOR EACH ROW
  EXECUTE FUNCTION public.check_player_objective_limit();

DROP TRIGGER IF EXISTS trg_check_team_objective_limit ON public.team_objectives;
CREATE TRIGGER trg_check_team_objective_limit
  BEFORE INSERT ON public.team_objectives
  FOR EACH ROW
  EXECUTE FUNCTION public.check_team_objective_limit();