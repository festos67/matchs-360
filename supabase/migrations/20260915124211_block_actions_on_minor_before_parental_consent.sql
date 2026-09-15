-- =====================================================================
-- Aucune action sur un joueur de moins de 15 ans tant que son representant
-- legal n'a pas donne son consentement (ou apres revocation).
--
-- Constat : un coach pouvait debriefer, fixer des objectifs, rattacher des
-- supporters et demander des avis sur un mineur non consenti (ex. un joueur
-- du club TEST : 1 debrief et 5 supporters sans aucun consentement).
--
-- Verrou en base, quel que soit le chemin (interface, API directe, fonctions
-- serveur) :
--   evaluations, evaluation_scores, evaluation_objectives : INSERT / UPDATE
--     (la suppression logique - deleted_at - reste permise)
--   player_objectives : INSERT / UPDATE (DELETE permis)
--   player_objective_attachments : INSERT
--   supporters_link : INSERT / UPDATE OF player_id (DELETE permis)
--   self_evaluation_requests, supporter_evaluation_requests : INSERT
-- Les mises a jour faites par service_role (effacement RGPD) passent.
--
-- Hors perimetre, volontairement : profil (corrections d'identite, photo
-- deja masquee sans droit a l'image), equipe (inscription, transfert),
-- representant legal (changement, relance).
--
-- record-parental-consent insere le consentement AVANT le lien supporter du
-- representant legal : ce lien n'est donc pas bloque.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.minor_consent_pending(_player_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(public.requires_parental_consent(_player_id), false)
     AND NOT public.minor_has_valid_consent(_player_id);
$$;

REVOKE ALL ON FUNCTION public.minor_consent_pending(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minor_consent_pending(uuid) TO service_role;

-- Pour l'interface : parmi les joueurs demandes, ceux en attente de
-- consentement ET visibles par l'appelant (pas d'oracle sur des tiers).
CREATE OR REPLACE FUNCTION public.get_consent_pending_player_ids(_player_ids uuid[])
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT pid
  FROM unnest(_player_ids) AS pid
  WHERE auth.uid() IS NOT NULL
    AND public.minor_consent_pending(pid)
    AND (
      public.is_admin(auth.uid())
      OR public.is_coach_of_player(auth.uid(), pid)
      OR public.is_club_coach_of_player(auth.uid(), pid)
      OR public.is_club_admin(auth.uid(), public.get_player_club_id(pid))
      OR EXISTS (
        SELECT 1 FROM public.supporters_link s
        WHERE s.player_id = pid AND s.supporter_id = auth.uid()
      )
    );
$$;

REVOKE ALL ON FUNCTION public.get_consent_pending_player_ids(uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_consent_pending_player_ids(uuid[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guard_minor_consent_pending()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _player uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  CASE TG_TABLE_NAME
    WHEN 'evaluations' THEN
      IF TG_OP = 'UPDATE' AND NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
        RETURN NEW;
      END IF;
      _player := NEW.player_id;
    WHEN 'evaluation_scores', 'evaluation_objectives' THEN
      IF TG_OP = 'UPDATE' AND NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
        RETURN NEW;
      END IF;
      SELECT e.player_id INTO _player FROM public.evaluations e WHERE e.id = NEW.evaluation_id;
    WHEN 'player_objective_attachments' THEN
      SELECT po.player_id INTO _player FROM public.player_objectives po WHERE po.id = NEW.objective_id;
    ELSE
      _player := NEW.player_id;
  END CASE;

  IF _player IS NOT NULL AND public.minor_consent_pending(_player) THEN
    RAISE EXCEPTION 'MINOR_CONSENT_PENDING: le representant legal n''a pas encore donne son consentement pour ce joueur'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_minor_consent_pending() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_minor_consent_pending ON public.evaluations;
CREATE TRIGGER trg_guard_minor_consent_pending
  BEFORE INSERT OR UPDATE ON public.evaluations
  FOR EACH ROW EXECUTE FUNCTION public.guard_minor_consent_pending();

DROP TRIGGER IF EXISTS trg_guard_minor_consent_pending ON public.evaluation_scores;
CREATE TRIGGER trg_guard_minor_consent_pending
  BEFORE INSERT OR UPDATE ON public.evaluation_scores
  FOR EACH ROW EXECUTE FUNCTION public.guard_minor_consent_pending();

DROP TRIGGER IF EXISTS trg_guard_minor_consent_pending ON public.evaluation_objectives;
CREATE TRIGGER trg_guard_minor_consent_pending
  BEFORE INSERT OR UPDATE ON public.evaluation_objectives
  FOR EACH ROW EXECUTE FUNCTION public.guard_minor_consent_pending();

DROP TRIGGER IF EXISTS trg_guard_minor_consent_pending ON public.player_objectives;
CREATE TRIGGER trg_guard_minor_consent_pending
  BEFORE INSERT OR UPDATE ON public.player_objectives
  FOR EACH ROW EXECUTE FUNCTION public.guard_minor_consent_pending();

DROP TRIGGER IF EXISTS trg_guard_minor_consent_pending ON public.player_objective_attachments;
CREATE TRIGGER trg_guard_minor_consent_pending
  BEFORE INSERT ON public.player_objective_attachments
  FOR EACH ROW EXECUTE FUNCTION public.guard_minor_consent_pending();

DROP TRIGGER IF EXISTS trg_guard_minor_consent_pending ON public.supporters_link;
CREATE TRIGGER trg_guard_minor_consent_pending
  BEFORE INSERT OR UPDATE OF player_id ON public.supporters_link
  FOR EACH ROW EXECUTE FUNCTION public.guard_minor_consent_pending();

DROP TRIGGER IF EXISTS trg_guard_minor_consent_pending ON public.self_evaluation_requests;
CREATE TRIGGER trg_guard_minor_consent_pending
  BEFORE INSERT ON public.self_evaluation_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_minor_consent_pending();

DROP TRIGGER IF EXISTS trg_guard_minor_consent_pending ON public.supporter_evaluation_requests;
CREATE TRIGGER trg_guard_minor_consent_pending
  BEFORE INSERT ON public.supporter_evaluation_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_minor_consent_pending();
