CREATE OR REPLACE FUNCTION public.check_evaluation_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_club_id UUID;
  v_plan public.subscription_plan;
  v_limits RECORD;
  v_count INTEGER;
  v_limit INTEGER;
  v_code TEXT;
  v_label TEXT;
BEGIN
  -- Skip soft-deleted rows (defensive)
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Resolve player's club via active team membership
  SELECT public.get_player_club_id(NEW.player_id) INTO v_club_id;

  -- If player has no club (orphan/admin context), don't enforce
  IF v_club_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT public.get_club_plan(v_club_id) INTO v_plan;
  SELECT * INTO v_limits FROM public.plan_limits WHERE plan = v_plan;

  IF NEW.type = 'coach' THEN
    v_limit := v_limits.max_coach_evals_per_player;
    v_label := 'débrief(s) coach par joueur';
  ELSIF NEW.type = 'self' THEN
    v_limit := v_limits.max_self_evals_per_player;
    v_label := 'auto-débrief(s) par joueur';
  ELSIF NEW.type = 'supporter' THEN
    v_limit := v_limits.max_supporter_evals_per_player;
    v_label := 'débrief(s) supporter par joueur';
  ELSE
    RETURN NEW;
  END IF;

  -- -1 (or NULL) = unlimited
  IF v_limit IS NULL OR v_limit < 0 THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.evaluations
  WHERE player_id = NEW.player_id
    AND type = NEW.type
    AND deleted_at IS NULL;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'PLAN_LIMIT_EVALS:Limite du plan % atteinte : % % maximum.', v_plan, v_limit, v_label;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_check_evaluation_limit ON public.evaluations;
CREATE TRIGGER trg_check_evaluation_limit
  BEFORE INSERT ON public.evaluations
  FOR EACH ROW
  EXECUTE FUNCTION public.check_evaluation_limit();