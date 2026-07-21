CREATE OR REPLACE FUNCTION public.restore_public_template_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.framework_save_in_progress', 'on', true);

  INSERT INTO public.competence_frameworks (id, name, is_template, team_id, club_id)
  VALUES ('00000000-0000-0000-0000-000000000003', 'Modèle Santé Publique France', true, NULL, NULL)
  ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name,
      is_template = true,
      team_id = NULL,
      club_id = NULL,
      is_archived = false;

  DELETE FROM public.skills
  WHERE theme_id IN (
    SELECT id FROM public.themes
    WHERE framework_id = '00000000-0000-0000-0000-000000000003'
  );

  DELETE FROM public.themes
  WHERE framework_id = '00000000-0000-0000-0000-000000000003';

  INSERT INTO public.themes (id, framework_id, name, color, order_index) VALUES
    ('00000000-0000-0000-0003-000000000001', '00000000-0000-0000-0000-000000000003', 'Renforcer sa conscience de soi', '#C4B5FD', 0),
    ('00000000-0000-0000-0003-000000000002', '00000000-0000-0000-0000-000000000003', 'Renforcer sa conscience des émotions', '#FCD9B6', 1),
    ('00000000-0000-0000-0003-000000000003', '00000000-0000-0000-0000-000000000003', 'Développer des relations constructives', '#BAD9F2', 2),
    ('00000000-0000-0000-0003-000000000004', '00000000-0000-0000-0000-000000000003', 'Renforcer sa maîtrise de soi et son accomplissement', '#D6DEE3', 3),
    ('00000000-0000-0000-0003-000000000005', '00000000-0000-0000-0000-000000000003', 'Réguler ses émotions et son stress', '#F5C5C5', 4),
    ('00000000-0000-0000-0003-000000000006', '00000000-0000-0000-0000-000000000003', 'Résoudre des difficultés relationnelles', '#B5E0D3', 5);

  INSERT INTO public.skills (theme_id, name, definition, order_index) VALUES
    ('00000000-0000-0000-0003-000000000001', 'Accroître sa connaissance de soi', 'Connaît ses forces et ses limites.', 0),
    ('00000000-0000-0000-0003-000000000001', 'Savoir penser de façon critique', 'Se fait son propre avis ; repère les influences avant de croire une information.', 1),
    ('00000000-0000-0000-0003-000000000001', 'Connaître ses valeurs, ses besoins et ses buts personnels', 'Sait ce qui est important pour lui/elle et ce qu''il/elle veut.', 2),
    ('00000000-0000-0000-0003-000000000001', 'Prendre des décisions constructives', 'Fait des choix réfléchis, en pensant aux conséquences.', 3),
    ('00000000-0000-0000-0003-000000000001', 'S''auto-évaluer positivement', 'Voit ce qu''il/elle réussit, pas seulement ses erreurs.', 4),
    ('00000000-0000-0000-0003-000000000001', 'Renforcer sa pleine attention à soi', 'Sait s''arrêter pour observer ce qui se passe en lui/elle.', 5),
    ('00000000-0000-0000-0003-000000000002', 'Comprendre les émotions', 'Sait ce que sont les émotions et à quoi elles servent.', 0),
    ('00000000-0000-0000-0003-000000000002', 'Identifier ses émotions', 'Sait dire ce qu''il/elle ressent : joie, colère, peur, tristesse.', 1),
    ('00000000-0000-0000-0003-000000000003', 'Communiquer de façon efficace et positive', 'S''exprime clairement et avec respect.', 0),
    ('00000000-0000-0000-0003-000000000003', 'Communiquer de façon empathique', 'Écoute l''autre et se met à sa place.', 1),
    ('00000000-0000-0000-0003-000000000003', 'Développer des liens et des comportements prosociaux', 'Va vers les autres, coopère, aide.', 2),
    ('00000000-0000-0000-0003-000000000004', 'Atteindre ses buts personnels', 'Se fixe un objectif et avance pas à pas.', 0),
    ('00000000-0000-0000-0003-000000000004', 'Gérer ses impulsions', 'Réfléchit avant d''agir.', 1),
    ('00000000-0000-0000-0003-000000000004', 'Résoudre des problèmes de façon créative et efficace', 'Cherche des solutions nouvelles quand quelque chose bloque.', 2),
    ('00000000-0000-0000-0003-000000000004', 'Savoir demander de l''aide', 'Demande de l''aide quand il/elle en a besoin.', 3),
    ('00000000-0000-0000-0003-000000000005', 'Exprimer ses émotions de façon constructive', 'Dit ce qu''il/elle ressent sans blesser les autres.', 0),
    ('00000000-0000-0000-0003-000000000005', 'Réguler ses émotions agréables et désagréables', 'Retrouve son calme après une émotion forte.', 1),
    ('00000000-0000-0000-0003-000000000005', 'Comprendre et gérer son stress', 'Repère son stress et sait le faire baisser.', 2),
    ('00000000-0000-0000-0003-000000000006', 'S''affirmer et résister à la pression sociale', 'Sait dire non et donner son avis, même face au groupe.', 0),
    ('00000000-0000-0000-0003-000000000006', 'Résoudre les conflits de façon constructive', 'Règle les disputes en parlant, en cherchant un accord.', 1);

  INSERT INTO public.competence_frameworks (id, name, is_template, team_id, club_id)
  VALUES ('00000000-0000-0000-0000-000000000005', 'Modèle « Centre de formation »', true, NULL, NULL)
  ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name,
      is_template = true,
      team_id = NULL,
      club_id = NULL,
      is_archived = false;

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

  PERFORM set_config('app.framework_save_in_progress', 'off', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.restore_public_template_data() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restore_public_template_data() TO service_role;

SELECT public.restore_public_template_data();