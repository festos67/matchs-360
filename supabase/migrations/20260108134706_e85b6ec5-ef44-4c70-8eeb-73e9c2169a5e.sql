-- Insert the Standard Template Framework
INSERT INTO public.competence_frameworks (id, name, is_template, club_id, team_id)
VALUES ('00000000-0000-0000-0000-000000000001', 'Modèle Standard', true, NULL, NULL);

-- Theme A: Compétences sportives (order_index: 0)
INSERT INTO public.themes (id, framework_id, name, color, order_index)
VALUES ('00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0000-000000000001', 'Compétences sportives', '#3B82F6', 0);

INSERT INTO public.skills (theme_id, name, definition, order_index) VALUES
('00000000-0000-0000-0001-000000000001', 'Hygiène de vie', 'Sommeil, alimentation, hydratation, nutrition, addictions', 0),
('00000000-0000-0000-0001-000000000001', 'Capacités individuelles', 'Technique, tactique, endurance, force, vitesse, coordination', 1),
('00000000-0000-0000-0001-000000000001', 'Capacités collectives', 'Travail en équipe, jeu collectif', 2),
('00000000-0000-0000-0001-000000000001', 'Investissement à l''entraînement', 'Présence régulière, niveau d''effort', 3),
('00000000-0000-0000-0001-000000000001', 'Progression sportive', 'Amélioration observable des capacités', 4),
('00000000-0000-0000-0001-000000000001', 'Résultats en compétition', 'Efficacité, statistiques, résistance à la pression', 5);

-- Theme B: Soft-skills Fondamentales (order_index: 1)
INSERT INTO public.themes (id, framework_id, name, color, order_index)
VALUES ('00000000-0000-0000-0001-000000000002', '00000000-0000-0000-0000-000000000001', 'Soft-skills Fondamentales', '#10B981', 1);

INSERT INTO public.skills (theme_id, name, definition, order_index) VALUES
('00000000-0000-0000-0001-000000000002', 'Engagement', 'Motivation, assiduité, ponctualité, fiabilité', 0),
('00000000-0000-0000-0001-000000000002', 'Respect', 'Politesse, respect du jeu, des règles, du matériel, des adversaires, de l''arbitrage', 1);

-- Theme C: Soft-skills Mentales (order_index: 2)
INSERT INTO public.themes (id, framework_id, name, color, order_index)
VALUES ('00000000-0000-0000-0001-000000000003', '00000000-0000-0000-0000-000000000001', 'Soft-skills Mentales', '#8B5CF6', 2);

INSERT INTO public.skills (theme_id, name, definition, order_index) VALUES
('00000000-0000-0000-0001-000000000003', 'Confiance en soi', 'Connaissance de soi, estime de soi, acceptation de son image', 0),
('00000000-0000-0000-0001-000000000003', 'Gestion des émotions', 'Gestion du stress, maîtrise de soi, acceptation des critiques', 1),
('00000000-0000-0000-0001-000000000003', 'Dépassement de soi', 'Goût de l''effort, prise de risque, détermination, persévérance', 2);

-- Theme D: Soft-skills Relationnelles (order_index: 3)
INSERT INTO public.themes (id, framework_id, name, color, order_index)
VALUES ('00000000-0000-0000-0001-000000000004', '00000000-0000-0000-0000-000000000001', 'Soft-skills Relationnelles', '#F59E0B', 3);

INSERT INTO public.skills (theme_id, name, definition, order_index) VALUES
('00000000-0000-0000-0001-000000000004', 'Communication', 'Expression de soi verbale et non verbale, écoute de l''autre', 0),
('00000000-0000-0000-0001-000000000004', 'Compétences relationnelles', 'Coopération, solidarité, prise d''initiative, leadership', 1);

-- Theme E: Soft-skills Cognitives (order_index: 4)
INSERT INTO public.themes (id, framework_id, name, color, order_index)
VALUES ('00000000-0000-0000-0001-000000000005', '00000000-0000-0000-0000-000000000001', 'Soft-skills Cognitives', '#EF4444', 4);

INSERT INTO public.skills (theme_id, name, definition, order_index) VALUES
('00000000-0000-0000-0001-000000000005', 'Capacité d''apprentissage', 'Concentration, mémorisation, curiosité', 0),
('00000000-0000-0000-0001-000000000005', 'Organisation', 'Gestion des informations, compréhension des consignes, vision stratégique', 1),
('00000000-0000-0000-0001-000000000005', 'Adaptabilité', 'Ouverture d''esprit, intégration dans un groupe, créativité', 2);

-- Theme F: Projet personnel & Vie de Club (order_index: 5)
INSERT INTO public.themes (id, framework_id, name, color, order_index)
VALUES ('00000000-0000-0000-0001-000000000006', '00000000-0000-0000-0000-000000000001', 'Projet personnel & Vie de Club', '#06B6D4', 5);

INSERT INTO public.skills (theme_id, name, definition, order_index) VALUES
('00000000-0000-0000-0001-000000000006', 'Autonomie', 'Administrative, mobilité, accès à l''informatique', 0),
('00000000-0000-0000-0001-000000000006', 'Projet personnel et professionnel', 'Définir ses objectifs et planifier son avenir', 1),
('00000000-0000-0000-0001-000000000006', 'Investissement dans le club', 'Bénévolat, aide aux événements, représentation, respect des valeurs', 2);