-- =====================================================================
-- Espace parent : règles d'accès du représentant légal à la fiche de son
-- enfant, selon l'âge.
--
--  - Moins de 15 ans : le parent voit tout le suivi (débriefs du coach,
--    auto-débriefs, avis des supporters, objectifs) et peut remplir un
--    auto-débrief AVEC son enfant (evaluator_id = parent).
--  - 15-17 ans : le jeune gère ses données (RGPD art. 8 FR). Le parent ne
--    voit plus que les débriefs du coach et les objectifs, et ne peut plus
--    créer d'auto-débrief. (Il garde la lecture de ce qu'il a lui-même écrit
--    via la règle existante « l'auteur voit ses débriefs ».)
--  - 18 ans : has_guardian_access (is_minor) coupe tout, inchangé.
--
-- current_user_has_password() : permet à la page de consentement de proposer
-- au parent de choisir son mot de passe s'il n'en a pas (compte créé par le
-- lien d'invitation, sans mot de passe).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.current_user_has_password()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE((
    SELECT u.encrypted_password IS NOT NULL AND u.encrypted_password <> ''
    FROM auth.users u
    WHERE u.id = auth.uid()
  ), false);
$$;

REVOKE ALL ON FUNCTION public.current_user_has_password() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.current_user_has_password() TO authenticated;

-- Lecture : coach toujours ; le reste seulement pour un enfant de moins de 15 ans.
ALTER POLICY "Guardians view evaluations of their child" ON public.evaluations
  USING (
    has_guardian_access(auth.uid(), player_id)
    AND (type = 'coach'::evaluation_type OR requires_parental_consent(player_id))
  );

ALTER POLICY "Guardians view evaluation scores of their child" ON public.evaluation_scores
  USING (
    evaluation_id IN (
      SELECT e.id FROM evaluations e
      WHERE has_guardian_access(auth.uid(), e.player_id)
        AND (e.type = 'coach'::evaluation_type OR requires_parental_consent(e.player_id))
    )
  );

-- Auto-débrief rempli avec le parent : moins de 15 ans uniquement.
ALTER POLICY "Guardians create self evaluation for their child" ON public.evaluations
  WITH CHECK (
    type = 'self'::evaluation_type
    AND evaluator_id = auth.uid()
    AND has_guardian_access(auth.uid(), player_id)
    AND requires_parental_consent(player_id)
  );

ALTER POLICY "Guardians update self evaluation of their child" ON public.evaluations
  USING (
    type = 'self'::evaluation_type
    AND evaluator_id = auth.uid()
    AND has_guardian_access(auth.uid(), player_id)
    AND requires_parental_consent(player_id)
  );

ALTER POLICY "Guardians manage self evaluation scores of their child" ON public.evaluation_scores
  USING (
    evaluation_id IN (
      SELECT e.id FROM evaluations e
      WHERE e.type = 'self'::evaluation_type
        AND e.evaluator_id = auth.uid()
        AND has_guardian_access(auth.uid(), e.player_id)
        AND requires_parental_consent(e.player_id)
    )
  )
  WITH CHECK (
    evaluation_id IN (
      SELECT e.id FROM evaluations e
      WHERE e.type = 'self'::evaluation_type
        AND e.evaluator_id = auth.uid()
        AND has_guardian_access(auth.uid(), e.player_id)
        AND requires_parental_consent(e.player_id)
    )
  );

-- Objectifs des débriefs : lecture alignée sur les débriefs ; écriture pour
-- l'auto-débrief rempli par le parent (le formulaire en enregistre).
DROP POLICY IF EXISTS "Guardians view evaluation objectives of their child" ON public.evaluation_objectives;
CREATE POLICY "Guardians view evaluation objectives of their child" ON public.evaluation_objectives
  FOR SELECT TO authenticated
  USING (
    evaluation_id IN (
      SELECT e.id FROM evaluations e
      WHERE has_guardian_access(auth.uid(), e.player_id)
        AND (e.type = 'coach'::evaluation_type OR requires_parental_consent(e.player_id))
    )
  );

DROP POLICY IF EXISTS "Guardians manage self evaluation objectives of their child" ON public.evaluation_objectives;
CREATE POLICY "Guardians manage self evaluation objectives of their child" ON public.evaluation_objectives
  FOR ALL TO authenticated
  USING (
    evaluation_id IN (
      SELECT e.id FROM evaluations e
      WHERE e.type = 'self'::evaluation_type
        AND e.evaluator_id = auth.uid()
        AND has_guardian_access(auth.uid(), e.player_id)
        AND requires_parental_consent(e.player_id)
    )
  )
  WITH CHECK (
    evaluation_id IN (
      SELECT e.id FROM evaluations e
      WHERE e.type = 'self'::evaluation_type
        AND e.evaluator_id = auth.uid()
        AND has_guardian_access(auth.uid(), e.player_id)
        AND requires_parental_consent(e.player_id)
    )
  );

-- Clôture de la demande d'auto-débrief quand le parent le remplit avec l'enfant.
DROP POLICY IF EXISTS "Guardians complete self eval requests of their child" ON public.self_evaluation_requests;
CREATE POLICY "Guardians complete self eval requests of their child" ON public.self_evaluation_requests
  FOR UPDATE TO authenticated
  USING (has_guardian_access(auth.uid(), player_id) AND requires_parental_consent(player_id))
  WITH CHECK (has_guardian_access(auth.uid(), player_id) AND requires_parental_consent(player_id));
