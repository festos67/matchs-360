-- =====================================================================
-- Lecture seule des equipes du club pour les coachs du club.
--
-- Decision produit : un coach qui ouvre une equipe du club dont il n'est ni
-- referent ni assistant voit LA MEME PAGE que le coach de cette equipe —
-- effectif, fiches joueurs, debriefs (auto-debriefs compris), referentiel,
-- objectifs — sans aucun droit de modification.
--
-- Jusqu'ici les regles d'acces limitaient un coach a SES equipes : la galerie
-- « Equipes du club » n'en montrait qu'une sur trois au coach du club TEST, et
-- ouvrir une autre equipe finissait sur « Equipe non trouvee ».
--
-- Principes :
--  1. LECTURE SEULE, garantie par la base et pas seulement par l'interface :
--     toutes les policies ajoutees sont FOR SELECT. is_coach_of_team et
--     is_coach_of_player, sur lesquelles reposent les droits d'ECRITURE, ne
--     sont pas modifiees.
--  2. Perimetre = le CLUB, via une affectation de coach ACTIVE dans une equipe
--     non archivee de ce club. Un role « coach » residuel sur un club ou toutes
--     les affectations ont ete archivees n'ouvre rien.
--  3. Miroir strict de ce que lit le coach de l'equipe, rien de plus. Les
--     coordonnees des representants legaux (guardian_designations) ne sont PAS
--     ouvertes : le panneau correspondant n'est affiche qu'a qui peut evaluer.
--  4. Le masquage des photos sans droit a l'image (image_rights_consent_at)
--     reste applique cote client, comme pour le coach de l'equipe.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Fonctions de perimetre
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_club_coach_of_team(_user_id uuid, _team_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Garde anti-oracle F-205, identique aux fonctions soeurs.
  IF _user_id IS DISTINCT FROM auth.uid()
     AND auth.role() IS DISTINCT FROM 'service_role'
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles ur
       WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
     ) THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.teams target
    JOIN public.teams mine
      ON mine.club_id = target.club_id
     AND mine.deleted_at IS NULL
    JOIN public.team_members tm
      ON tm.team_id = mine.id
    WHERE target.id = _team_id
      AND target.deleted_at IS NULL
      AND tm.user_id = _user_id
      AND tm.member_type = 'coach'
      AND tm.is_active = true
      AND tm.deleted_at IS NULL
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_club_coach_of_player(_user_id uuid, _player_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid()
     AND auth.role() IS DISTINCT FROM 'service_role'
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles ur
       WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
     ) THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.team_members p
    JOIN public.teams pt
      ON pt.id = p.team_id
     AND pt.deleted_at IS NULL
    JOIN public.teams ct
      ON ct.club_id = pt.club_id
     AND ct.deleted_at IS NULL
    JOIN public.team_members c
      ON c.team_id = ct.id
    WHERE p.user_id = _player_id
      AND p.member_type = 'player'
      AND p.is_active = true
      AND p.deleted_at IS NULL
      AND c.user_id = _user_id
      AND c.member_type = 'coach'
      AND c.is_active = true
      AND c.deleted_at IS NULL
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.is_club_coach_of_team(uuid, uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.is_club_coach_of_player(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_club_coach_of_team(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_club_coach_of_player(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- Equipe, effectif, profils
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Club coaches read club teams" ON public.teams;
CREATE POLICY "Club coaches read club teams"
ON public.teams FOR SELECT TO authenticated
USING (deleted_at IS NULL AND public.is_club_coach_of_team(auth.uid(), id));

DROP POLICY IF EXISTS "Club coaches read club team members" ON public.team_members;
CREATE POLICY "Club coaches read club team members"
ON public.team_members FOR SELECT TO authenticated
USING (
  is_active = true
  AND deleted_at IS NULL
  AND public.is_club_coach_of_team(auth.uid(), team_id)
);

DROP POLICY IF EXISTS "Club coaches read club team member profiles" ON public.profiles;
CREATE POLICY "Club coaches read club team member profiles"
ON public.profiles FOR SELECT TO authenticated
USING (
  deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.user_id = profiles.id
      AND tm.is_active = true
      AND tm.deleted_at IS NULL
      AND public.is_club_coach_of_team(auth.uid(), tm.team_id)
  )
);

DROP POLICY IF EXISTS "Club coaches read club supporter links" ON public.supporters_link;
CREATE POLICY "Club coaches read club supporter links"
ON public.supporters_link FOR SELECT TO authenticated
USING (public.is_club_coach_of_player(auth.uid(), player_id));

-- ---------------------------------------------------------------------
-- Debriefs (memes types que pour le coach de l'equipe)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Club coaches read club evaluations" ON public.evaluations;
CREATE POLICY "Club coaches read club evaluations"
ON public.evaluations FOR SELECT TO authenticated
USING (
  type = ANY (ARRAY['coach'::evaluation_type, 'self'::evaluation_type, 'supporter'::evaluation_type])
  AND public.is_club_coach_of_player(auth.uid(), player_id)
);

DROP POLICY IF EXISTS "Club coaches read club evaluation scores" ON public.evaluation_scores;
CREATE POLICY "Club coaches read club evaluation scores"
ON public.evaluation_scores FOR SELECT TO authenticated
USING (
  evaluation_id IN (
    SELECT e.id FROM public.evaluations e
    WHERE e.type = ANY (ARRAY['coach'::evaluation_type, 'self'::evaluation_type, 'supporter'::evaluation_type])
      AND public.is_club_coach_of_player(auth.uid(), e.player_id)
  )
);

DROP POLICY IF EXISTS "Club coaches read club evaluation objectives" ON public.evaluation_objectives;
CREATE POLICY "Club coaches read club evaluation objectives"
ON public.evaluation_objectives FOR SELECT TO authenticated
USING (
  evaluation_id IN (
    SELECT e.id FROM public.evaluations e
    WHERE e.type = ANY (ARRAY['coach'::evaluation_type, 'self'::evaluation_type, 'supporter'::evaluation_type])
      AND public.is_club_coach_of_player(auth.uid(), e.player_id)
  )
);

-- ---------------------------------------------------------------------
-- Referentiel d'equipe
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Club coaches read club team frameworks" ON public.competence_frameworks;
CREATE POLICY "Club coaches read club team frameworks"
ON public.competence_frameworks FOR SELECT TO authenticated
USING (team_id IS NOT NULL AND public.is_club_coach_of_team(auth.uid(), team_id));

DROP POLICY IF EXISTS "Club coaches read club team themes" ON public.themes;
CREATE POLICY "Club coaches read club team themes"
ON public.themes FOR SELECT TO authenticated
USING (
  framework_id IN (
    SELECT cf.id FROM public.competence_frameworks cf
    WHERE cf.team_id IS NOT NULL
      AND public.is_club_coach_of_team(auth.uid(), cf.team_id)
  )
);

DROP POLICY IF EXISTS "Club coaches read club team skills" ON public.skills;
CREATE POLICY "Club coaches read club team skills"
ON public.skills FOR SELECT TO authenticated
USING (
  theme_id IN (
    SELECT th.id
    FROM public.themes th
    JOIN public.competence_frameworks cf ON cf.id = th.framework_id
    WHERE cf.team_id IS NOT NULL
      AND public.is_club_coach_of_team(auth.uid(), cf.team_id)
  )
);

-- ---------------------------------------------------------------------
-- Objectifs d'equipe et individuels, et leurs pieces jointes
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Club coaches read club team objectives" ON public.team_objectives;
CREATE POLICY "Club coaches read club team objectives"
ON public.team_objectives FOR SELECT TO authenticated
USING (public.is_club_coach_of_team(auth.uid(), team_id));

DROP POLICY IF EXISTS "Club coaches read club objective attachments" ON public.objective_attachments;
CREATE POLICY "Club coaches read club objective attachments"
ON public.objective_attachments FOR SELECT TO authenticated
USING (
  objective_id IN (
    SELECT o.id FROM public.team_objectives o
    WHERE public.is_club_coach_of_team(auth.uid(), o.team_id)
  )
);

DROP POLICY IF EXISTS "Club coaches read club player objectives" ON public.player_objectives;
CREATE POLICY "Club coaches read club player objectives"
ON public.player_objectives FOR SELECT TO authenticated
USING (public.is_club_coach_of_team(auth.uid(), team_id));

DROP POLICY IF EXISTS "Club coaches read club player objective attachments" ON public.player_objective_attachments;
CREATE POLICY "Club coaches read club player objective attachments"
ON public.player_objective_attachments FOR SELECT TO authenticated
USING (
  objective_id IN (
    SELECT po.id FROM public.player_objectives po
    WHERE public.is_club_coach_of_team(auth.uid(), po.team_id)
  )
);

-- ---------------------------------------------------------------------
-- Fichiers : photos de mineurs et pieces jointes d'objectifs
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Club coaches read club minor photos" ON storage.objects;
CREATE POLICY "Club coaches read club minor photos"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'user-photos-minors'
  AND public.is_club_coach_of_player(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

DROP POLICY IF EXISTS "Club coaches read club objective files" ON storage.objects;
CREATE POLICY "Club coaches read club objective files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'objective-attachments'
  AND (
    EXISTS (
      SELECT 1
      FROM public.objective_attachments oa
      JOIN public.team_objectives t_o ON t_o.id = oa.objective_id
      WHERE oa.file_path = objects.name
        AND public.is_club_coach_of_team(auth.uid(), t_o.team_id)
    )
    OR EXISTS (
      SELECT 1
      FROM public.player_objective_attachments pa
      JOIN public.player_objectives po ON po.id = pa.objective_id
      WHERE pa.file_path = objects.name
        AND public.is_club_coach_of_team(auth.uid(), po.team_id)
    )
  )
);
