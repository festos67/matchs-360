-- =====================================================================
-- Phase 04 — Le representant legal accede a l'espace de son enfant.
--
-- Jusqu'ici, seule la table profiles ouvrait au titulaire de l'autorite
-- parentale. Les tables du parcours joueur ne connaissaient que le supporter,
-- via is_supporter_of_player.
--
-- Deux differences ASSUMEES avec un supporter ordinaire :
--
--  1. Le parent voit les AUTO-EVALUATIONS de son enfant. Les policies
--     supporter les excluent explicitement (type <> 'self') parce qu'un
--     supporter est un tiers ; le representant legal, lui, est celui qui
--     autorise l'auto-evaluation et repond de l'enfant.
--
--  2. L'acces s'arrete a la MAJORITE de l'enfant (has_guardian_access), meme
--     si le consentement n'a jamais ete revoque. Un consentement parental ne
--     survit pas a la majorite de son objet.
--
-- L'acces ne depend PAS de supporters_link : il decoule du consentement
-- parental lui-meme. Un lien supporter supprime par erreur ne doit pas priver
-- un parent de l'espace de son enfant.
--
-- Verifie apres application : le parent voit exactement le meme nombre de
-- referentiels que l'enfant, et MOINS de team_members (son enfant seul, pas
-- les coequipiers).
-- =====================================================================

-- Borne d'age : is_legal_guardian_of() n'est volontairement PAS modifiee.
-- Elle est utilisee par une dizaine de policies et par la revocation des
-- consentements — un signataire doit pouvoir consulter et revoquer ce qu'il a
-- signe, meme apres la majorite de l'enfant. Seul l'acces a l'ESPACE est borne.
CREATE OR REPLACE FUNCTION public.has_guardian_access(_guardian_id uuid, _minor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.is_legal_guardian_of(_guardian_id, _minor_id)
     AND public.is_minor(_minor_id);
$$;

REVOKE ALL ON FUNCTION public.has_guardian_access(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.has_guardian_access(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- Lecture du parcours joueur
-- ---------------------------------------------------------------------

DROP POLICY IF EXISTS "Guardians view evaluations of their child" ON public.evaluations;
CREATE POLICY "Guardians view evaluations of their child"
ON public.evaluations FOR SELECT TO authenticated
USING (public.has_guardian_access(auth.uid(), player_id));

DROP POLICY IF EXISTS "Guardians view evaluation scores of their child" ON public.evaluation_scores;
CREATE POLICY "Guardians view evaluation scores of their child"
ON public.evaluation_scores FOR SELECT TO authenticated
USING (
  evaluation_id IN (
    SELECT e.id FROM public.evaluations e
    WHERE public.has_guardian_access(auth.uid(), e.player_id)
  )
);

DROP POLICY IF EXISTS "Guardians view team membership of their child" ON public.team_members;
CREATE POLICY "Guardians view team membership of their child"
ON public.team_members FOR SELECT TO authenticated
USING (public.has_guardian_access(auth.uid(), user_id));

DROP POLICY IF EXISTS "Guardians view framework of their child team" ON public.competence_frameworks;
CREATE POLICY "Guardians view framework of their child team"
ON public.competence_frameworks FOR SELECT TO authenticated
USING (
  team_id IN (
    SELECT tm.team_id
    FROM public.team_members tm
    WHERE tm.is_active = true
      AND tm.deleted_at IS NULL
      AND public.has_guardian_access(auth.uid(), tm.user_id)
  )
);

DROP POLICY IF EXISTS "Guardians view objectives of their child" ON public.player_objectives;
CREATE POLICY "Guardians view objectives of their child"
ON public.player_objectives FOR SELECT TO authenticated
USING (public.has_guardian_access(auth.uid(), player_id));

DROP POLICY IF EXISTS "Guardians view self eval requests of their child" ON public.self_evaluation_requests;
CREATE POLICY "Guardians view self eval requests of their child"
ON public.self_evaluation_requests FOR SELECT TO authenticated
USING (public.has_guardian_access(auth.uid(), player_id));

-- ---------------------------------------------------------------------
-- Auto-evaluation saisie depuis le compte du representant legal
--
-- Un enfant sans adresse e-mail se connecte avec un identifiant, mais tant
-- qu'il n'en a pas, l'auto-evaluation ne pourrait jamais etre remplie : la
-- policy « Users can create evaluations » exige player_id = auth.uid().
-- Sans cette branche, la case « Auto-evaluation » du consentement serait une
-- autorisation sans effet avant 15 ans.
--
-- evaluator_id reste egal a auth.uid(), donc DIFFERENT de player_id : le canal
-- de saisie demeure lisible dans la donnee. Une auto-evaluation saisie par le
-- parent ne peut pas etre confondue avec une saisie par l'enfant.
--
-- Le trigger trg_enforce_self_eval_consent s'applique par-dessus : sans la
-- case cochee, l'insertion est refusee quoi qu'il arrive.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Guardians create self evaluation for their child" ON public.evaluations;
CREATE POLICY "Guardians create self evaluation for their child"
ON public.evaluations FOR INSERT TO authenticated
WITH CHECK (
  type = 'self'::evaluation_type
  AND evaluator_id = auth.uid()
  AND public.has_guardian_access(auth.uid(), player_id)
);

DROP POLICY IF EXISTS "Guardians manage self evaluation scores of their child" ON public.evaluation_scores;
CREATE POLICY "Guardians manage self evaluation scores of their child"
ON public.evaluation_scores FOR ALL TO authenticated
USING (
  evaluation_id IN (
    SELECT e.id FROM public.evaluations e
    WHERE e.type = 'self'::evaluation_type
      AND e.evaluator_id = auth.uid()
      AND public.has_guardian_access(auth.uid(), e.player_id)
  )
)
WITH CHECK (
  evaluation_id IN (
    SELECT e.id FROM public.evaluations e
    WHERE e.type = 'self'::evaluation_type
      AND e.evaluator_id = auth.uid()
      AND public.has_guardian_access(auth.uid(), e.player_id)
  )
);

DROP POLICY IF EXISTS "Guardians update self evaluation of their child" ON public.evaluations;
CREATE POLICY "Guardians update self evaluation of their child"
ON public.evaluations FOR UPDATE TO authenticated
USING (
  type = 'self'::evaluation_type
  AND evaluator_id = auth.uid()
  AND public.has_guardian_access(auth.uid(), player_id)
);
