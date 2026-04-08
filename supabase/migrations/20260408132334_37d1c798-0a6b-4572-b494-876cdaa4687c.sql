
-- 1. Rename enum values
ALTER TYPE evaluation_type RENAME VALUE 'coach_assessment' TO 'coach';
ALTER TYPE evaluation_type RENAME VALUE 'player_self_assessment' TO 'self';
ALTER TYPE evaluation_type RENAME VALUE 'supporter_assessment' TO 'supporter';

-- 2. Create validation trigger function
CREATE OR REPLACE FUNCTION public.validate_evaluation_type_coherence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.type = 'coach' AND (NEW.evaluator_id IS NULL OR NEW.evaluator_id = NEW.player_id) THEN
    RAISE EXCEPTION 'Coach evaluation requires evaluator_id to be set and different from player_id';
  END IF;

  IF NEW.type = 'self' AND (NEW.evaluator_id IS NULL OR NEW.evaluator_id != NEW.player_id) THEN
    RAISE EXCEPTION 'Self evaluation requires evaluator_id to equal player_id';
  END IF;

  IF NEW.type = 'supporter' AND (NEW.evaluator_id IS NULL OR NEW.evaluator_id = NEW.player_id) THEN
    RAISE EXCEPTION 'Supporter evaluation requires evaluator_id to be set and different from player_id';
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Attach trigger
CREATE TRIGGER trg_validate_evaluation_type_coherence
BEFORE INSERT OR UPDATE ON public.evaluations
FOR EACH ROW
EXECUTE FUNCTION public.validate_evaluation_type_coherence();
