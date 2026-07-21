-- Ensure the public academy template is present and readable/countable in every environment.

CREATE OR REPLACE FUNCTION public.restore_academy_template_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.framework_save_in_progress', 'on', true);

  INSERT INTO public.competence_frameworks (id, name, is_template, team_id, club_id, is_archived)
  VALUES ('00000000-0000-0000-0000-000000000005', 'Modèle « Centre de formation »', true, NULL, NULL, false)
  ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name,
      is_template = true,
      team_id = NULL,
      club_id = NULL,
      is_archived = false,
      archived_at = NULL,
      updated_at = now();

  DELETE FROM public.skills
  WHERE theme_id IN (
    SELECT id FROM public.themes
    WHERE framework_id = '00000000-0000-0000-0000-000000000005'
  );

  DELETE FROM public.themes
  WHERE framework_id = '00000000-0000-0000-0000-000000000005';

  INSERT INTO public.themes (id, framework_id, name, color, order_index) VALUES
    ('00000000-0000-0000-0005-000000000001','00000000-0000-0000-0000-000000000005','Performance sportive','#BAD9F2',0),
    ('00000000-0000-0000-0005-000000000002','00000000-0000-0000-0000-000000000005','Investissement','#B5E0D3',1),
    ('00000000-0000-0000-0005-000000000003','00000000-0000-0000-0000-000000000005','Résultat et compétition','#FCD9B6',2),
    ('00000000-0000-0000-0005-000000000004','00000000-0000-0000-0000-000000000005','Dimension humaine et sociale','#C8E6B8',3),
    ('00000000-0000-0000-0005-000000000005','00000000-0000-0000-0000-000000000005','Vie personnelle','#C4B5FD',4);

  INSERT INTO public.skills (theme_id, name, definition, order_index) VALUES
    ('00000000-0000-0000-0005-000000000001','Qualité technique sous pression','Capacité à conserver sa justesse technique (contrôle, passe, frappe) quand l''intensité, l''adversité ou l''enjeu augmentent.',0),
    ('00000000-0000-0000-0005-000000000001','Lecture du jeu','Capacité à anticiper les situations, à identifier les espaces et à prendre la bonne décision au bon moment.',1),
    ('00000000-0000-0000-0005-000000000001','Discipline tactique','Capacité à tenir son rôle dans l''organisation collective, y compris quand il est plus ingrat que le rôle individuel souhaité.',2),
    ('00000000-0000-0000-0005-000000000002','Engagement à l''entraînement','Capacité à maintenir le même niveau d''exigence hors compétition, quand personne ne regarde et qu''il n''y a rien à gagner immédiatement.',0),
    ('00000000-0000-0000-0005-000000000002','Hygiène de vie et professionnalisme','Capacité à assumer les contraintes du haut niveau (récupération, sommeil, nutrition, préparation) comme une part entière de la performance.',1),
    ('00000000-0000-0000-0005-000000000002','Capacité d''apprentissage','Capacité à recevoir une consigne ou une critique, à l''intégrer et à modifier concrètement son comportement de jeu.',2),
    ('00000000-0000-0000-0005-000000000003','Efficacité dans le moment clé','Capacité à peser sur l''issue d''un match dans les séquences décisives (dernier geste, duel, grande occasion).',0),
    ('00000000-0000-0000-0005-000000000003','Gestion des émotions en compétition','Capacité à réguler frustration, pression et euphorie pour rester lucide dans ses choix, après une erreur, une décision arbitrale ou un but encaissé.',1),
    ('00000000-0000-0000-0005-000000000003','Résilience après l''échec','Capacité à rebondir après une contre-performance, une blessure ou une mise à l''écart, sans se désengager.',2),
    ('00000000-0000-0000-0005-000000000004','Leadership et entraînement des autres','Capacité à élever le niveau du collectif par son attitude, sa parole ou son exemple, indépendamment du brassard.',0),
    ('00000000-0000-0000-0005-000000000004','Responsabilité et représentation','Capacité à mesurer la portée de ses actes et de ses paroles au-delà du terrain, en conscience de ce que le maillot représente pour d''autres.',1),
    ('00000000-0000-0000-0005-000000000004','Ouverture et respect des différences','Capacité à créer du lien dans un groupe aux parcours, origines et cultures très divers, et à faire de cette diversité une force collective.',2),
    ('00000000-0000-0000-0005-000000000005','Équilibre de vie','Capacité à préserver une vie personnelle en dehors du sport (relations, centres d''intérêt, temps pour soi) et à ne pas faire dépendre son équilibre des seuls résultats sportifs.',0),
    ('00000000-0000-0000-0005-000000000005','Gestion de son entourage et de son exposition','Capacité à poser des limites vis-à-vis de ses proches, de ses sollicitations et de son exposition publique, et à s''entourer de personnes qui lui font du bien.',1),
    ('00000000-0000-0000-0005-000000000005','Projection et préparation de l''avenir','Capacité à se fixer des objectifs personnels au-delà de la carrière sportive et à identifier concrètement les étapes pour les atteindre.',2);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.restore_academy_template_data() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restore_academy_template_data() TO service_role;

SELECT public.restore_academy_template_data();

DROP FUNCTION public.restore_academy_template_data();

GRANT SELECT ON public.competence_frameworks TO anon, authenticated;
GRANT SELECT ON public.themes TO anon, authenticated;
GRANT SELECT ON public.skills TO anon, authenticated;
GRANT ALL ON public.competence_frameworks TO service_role;
GRANT ALL ON public.themes TO service_role;
GRANT ALL ON public.skills TO service_role;

DROP POLICY IF EXISTS "Public templates readable" ON public.competence_frameworks;
CREATE POLICY "Public templates readable"
  ON public.competence_frameworks
  FOR SELECT
  TO anon, authenticated
  USING (is_template = true AND club_id IS NULL AND team_id IS NULL AND is_archived = false);

DROP POLICY IF EXISTS "Public template themes readable" ON public.themes;
CREATE POLICY "Public template themes readable"
  ON public.themes
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.competence_frameworks cf
      WHERE cf.id = themes.framework_id
        AND cf.is_template = true
        AND cf.club_id IS NULL
        AND cf.team_id IS NULL
        AND cf.is_archived = false
    )
  );

DROP POLICY IF EXISTS "Public template skills readable" ON public.skills;
CREATE POLICY "Public template skills readable"
  ON public.skills
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.themes th
      JOIN public.competence_frameworks cf ON cf.id = th.framework_id
      WHERE th.id = skills.theme_id
        AND cf.is_template = true
        AND cf.club_id IS NULL
        AND cf.team_id IS NULL
        AND cf.is_archived = false
    )
  );

CREATE OR REPLACE FUNCTION public.get_template_stats(p_framework_id uuid)
RETURNS TABLE(themes_count integer, skills_count integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE((SELECT COUNT(*)::int FROM public.themes t WHERE t.framework_id = p_framework_id), 0) AS themes_count,
    COALESCE((SELECT COUNT(*)::int FROM public.skills s
              JOIN public.themes t ON t.id = s.theme_id
              WHERE t.framework_id = p_framework_id), 0) AS skills_count
  WHERE EXISTS (
    SELECT 1
    FROM public.competence_frameworks cf
    WHERE cf.id = p_framework_id
      AND cf.is_template = true
      AND cf.club_id IS NULL
      AND cf.team_id IS NULL
      AND cf.is_archived = false
  );
$$;

REVOKE EXECUTE ON FUNCTION public.get_template_stats(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_template_stats(uuid) TO anon, authenticated, service_role;