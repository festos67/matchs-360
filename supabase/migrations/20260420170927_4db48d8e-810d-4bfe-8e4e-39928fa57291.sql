DROP TRIGGER IF EXISTS trg_check_team_limit ON public.teams;
CREATE TRIGGER trg_check_team_limit
  BEFORE INSERT ON public.teams
  FOR EACH ROW
  WHEN (NEW.deleted_at IS NULL)
  EXECUTE FUNCTION public.check_team_limit();

DROP TRIGGER IF EXISTS trg_check_member_limit ON public.team_members;
CREATE TRIGGER trg_check_member_limit
  BEFORE INSERT ON public.team_members
  FOR EACH ROW
  WHEN (NEW.is_active = true AND NEW.deleted_at IS NULL)
  EXECUTE FUNCTION public.check_member_limit();

DROP TRIGGER IF EXISTS trg_check_member_limit_on_reactivate ON public.team_members;
CREATE TRIGGER trg_check_member_limit_on_reactivate
  BEFORE UPDATE ON public.team_members
  FOR EACH ROW
  WHEN (
    (OLD.is_active = false OR OLD.deleted_at IS NOT NULL)
    AND NEW.is_active = true
    AND NEW.deleted_at IS NULL
  )
  EXECUTE FUNCTION public.check_member_limit();

DROP TRIGGER IF EXISTS trg_check_supporter_limit ON public.supporters_link;
CREATE TRIGGER trg_check_supporter_limit
  BEFORE INSERT ON public.supporters_link
  FOR EACH ROW
  EXECUTE FUNCTION public.check_supporter_limit();

DROP TRIGGER IF EXISTS trg_check_team_objective_limit ON public.team_objectives;
CREATE TRIGGER trg_check_team_objective_limit
  BEFORE INSERT ON public.team_objectives
  FOR EACH ROW
  EXECUTE FUNCTION public.check_team_objective_limit();

DROP TRIGGER IF EXISTS trg_check_player_objective_limit ON public.player_objectives;
CREATE TRIGGER trg_check_player_objective_limit
  BEFORE INSERT ON public.player_objectives
  FOR EACH ROW
  EXECUTE FUNCTION public.check_player_objective_limit();