-- =====================================================================
-- CORRECTIF — la policy « Guardians create self evaluation for their child »
-- (20260901155122) etait du CODE MORT.
--
-- Elle exige evaluator_id = auth.uid() (le parent) et has_guardian_access sur
-- player_id (l'enfant), donc evaluator_id <> player_id par construction. Or
-- validate_evaluation_type_coherence (20260408132334), jamais supprimee,
-- leve une exception dans ce cas exact :
--   IF NEW.type = 'self' AND NEW.evaluator_id != NEW.player_id THEN RAISE ...
--
-- Consequence : un parent cochait « Auto-evaluation » sur l'ecran de
-- consentement, puis toute tentative de saisie echouait sur
-- « Self evaluation requires evaluator_id to equal player_id ». Une
-- autorisation sans effet — exactement le mode de panne que les migrations du
-- 1er septembre avaient pour objet de corriger ailleurs.
--
-- Le trigger est etendu, pas affaibli : le seul cas nouvellement admis est
-- celui d'un titulaire de l'autorite parentale saisissant pour SON enfant
-- mineur, verifie par has_guardian_access (consentement non revoque + enfant
-- mineur). Un tiers quelconque reste rejete comme avant.
--
-- L'ecart evaluator_id <> player_id devient porteur de sens : il distingue
-- une saisie parentale d'une saisie par l'enfant. C'est ce qui permet de ne
-- jamais confondre les deux dans les donnees.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.validate_evaluation_type_coherence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.type = 'coach' AND (NEW.evaluator_id IS NULL OR NEW.evaluator_id = NEW.player_id) THEN
    RAISE EXCEPTION 'Coach evaluation requires evaluator_id to be set and different from player_id';
  END IF;

  IF NEW.type = 'self' THEN
    IF NEW.evaluator_id IS NULL THEN
      RAISE EXCEPTION 'Self evaluation requires evaluator_id to be set';
    END IF;
    -- Cas nominal : l'enfant saisit lui-meme.
    -- Cas admis : son representant legal saisit pour lui, tant qu'il est mineur.
    IF NEW.evaluator_id <> NEW.player_id
       AND NOT public.has_guardian_access(NEW.evaluator_id, NEW.player_id) THEN
      RAISE EXCEPTION 'Self evaluation requires evaluator_id to equal player_id, or a legal guardian of that minor';
    END IF;
  END IF;

  IF NEW.type = 'supporter' AND (NEW.evaluator_id IS NULL OR NEW.evaluator_id = NEW.player_id) THEN
    RAISE EXCEPTION 'Supporter evaluation requires evaluator_id to be set and different from player_id';
  END IF;

  RETURN NEW;
END;
$function$;
