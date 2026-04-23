-- =========================================================================
-- FIX cycle 5 #1 — Coach scope guard on evaluations (IDOR HAUTE)
-- Pattern identique à fn_guard_team_member_mutation (cycle 4 #5) :
-- trigger BEFORE INSERT/UPDATE SECURITY DEFINER avec helper existant
-- public.is_coach_of_player(coach_id, player_id) qui vérifie déjà
-- l'appartenance à une équipe commune active.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.fn_guard_evaluation_coach_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Bypass 1 : service_role (edge functions, jobs, migrations)
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Bypass 2 : super-admin
  IF public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- Bypass 3 : club_admin du club du joueur (god-view légitime)
  IF public.is_club_admin(auth.uid(), public.get_player_club_id(NEW.player_id)) THEN
    RETURN NEW;
  END IF;

  -- Pour les débriefs de type 'coach' : l'évaluateur DOIT être coach
  -- actif d'une équipe partagée avec le joueur. Ferme l'IDOR :
  -- coach A ne peut plus écrire sur player B hors-périmètre.
  IF NEW.type = 'coach' THEN
    IF NOT public.is_coach_of_player(NEW.evaluator_id, NEW.player_id) THEN
      RAISE EXCEPTION 'Forbidden: coach evaluation requires evaluator to be active coach of a team shared with the player'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- type='self' (déjà couvert par trigger validate_evaluation_type_coherence
  --   qui exige evaluator_id = player_id) : pas de check additionnel
  -- type='supporter' (couvert par RLS WITH CHECK is_supporter_of_player) :
  --   pas de check additionnel ici
  -- Defense-in-depth : on pourrait re-vérifier, mais l'autorité reste
  -- déjà cohérente via les autres mécanismes existants.

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_evaluation_coach_scope ON public.evaluations;
CREATE TRIGGER trg_guard_evaluation_coach_scope
  BEFORE INSERT OR UPDATE OF player_id, evaluator_id, type
  ON public.evaluations
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_guard_evaluation_coach_scope();