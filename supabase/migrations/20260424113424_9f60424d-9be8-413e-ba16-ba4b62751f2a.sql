-- Guard against placeholder / invalid team names being persisted (audit F19)
CREATE OR REPLACE FUNCTION public.guard_team_name_valid()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  v_normalized text;
BEGIN
  IF NEW.name IS NULL THEN
    RAISE EXCEPTION 'Team name is required'
      USING ERRCODE = '22023';
  END IF;

  -- Normalize: trim, lowercase, strip trailing dots/ellipsis, collapse whitespace
  v_normalized := lower(btrim(NEW.name));
  v_normalized := regexp_replace(v_normalized, '[\.\u2026]+$', '');
  v_normalized := btrim(v_normalized);
  v_normalized := regexp_replace(v_normalized, '\s+', ' ', 'g');

  IF length(v_normalized) < 2 THEN
    RAISE EXCEPTION 'Team name must be at least 2 characters'
      USING ERRCODE = '22023';
  END IF;

  IF v_normalized IN (
    'nom de l''equipe',
    'nom de l''équipe',
    'nom de lequipe',
    'nom équipe',
    'nom equipe',
    'team name',
    'nouvelle equipe',
    'nouvelle équipe',
    'u15 a, seniors b',
    'u15 a seniors b'
  ) THEN
    RAISE EXCEPTION 'Team name "%" looks like a placeholder. Please pick a real name.', NEW.name
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_team_name_valid ON public.teams;
CREATE TRIGGER trg_guard_team_name_valid
BEFORE INSERT OR UPDATE OF name ON public.teams
FOR EACH ROW
EXECUTE FUNCTION public.guard_team_name_valid();