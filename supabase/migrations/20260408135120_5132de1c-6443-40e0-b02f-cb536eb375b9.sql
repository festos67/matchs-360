
-- 10.3: Document the intent of each coach_role column
COMMENT ON COLUMN public.invitations.coach_role IS
  'Rôle coach proposé au moment de l''invitation. Valeur historique uniquement. '
  'Après acceptation, la source de vérité est team_members.coach_role.';

COMMENT ON COLUMN public.team_members.coach_role IS
  'Rôle coach effectif. Source de vérité unique. '
  'Initialisé depuis invitations.coach_role à l''acceptation, modifiable ensuite.';

-- 10.4: Prevent coach_role modification on accepted invitations via trigger
CREATE OR REPLACE FUNCTION public.prevent_coach_role_change_after_acceptance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.status = 'accepted' AND NEW.coach_role IS DISTINCT FROM OLD.coach_role THEN
    RAISE EXCEPTION 'Cannot modify coach_role on an accepted invitation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prevent_coach_role_change
  BEFORE UPDATE ON public.invitations
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_coach_role_change_after_acceptance();
