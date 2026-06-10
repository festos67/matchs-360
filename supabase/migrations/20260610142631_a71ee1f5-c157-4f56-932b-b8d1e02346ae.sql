
-- Idempotence : on recrée proprement le modèle MATCHS s'il existait déjà
DELETE FROM public.competence_frameworks WHERE id = '00000000-0000-0000-0000-000000000002';

INSERT INTO public.competence_frameworks (id, name, is_template, is_archived, team_id, club_id)
VALUES ('00000000-0000-0000-0000-000000000002', 'Modèle MATCHS', true, false, NULL, NULL);

-- Thématiques
WITH t AS (
  INSERT INTO public.themes (framework_id, name, order_index) VALUES
    ('00000000-0000-0000-0000-000000000002', 'Engagement', 0),
    ('00000000-0000-0000-0000-000000000002', 'Respect', 1),
    ('00000000-0000-0000-0000-000000000002', 'Aptitudes physiques', 2),
    ('00000000-0000-0000-0000-000000000002', 'Confiance en soi', 3),
    ('00000000-0000-0000-0000-000000000002', 'Dépassement de soi', 4),
    ('00000000-0000-0000-0000-000000000002', 'Gestion des émotions', 5),
    ('00000000-0000-0000-0000-000000000002', 'Communication', 6),
    ('00000000-0000-0000-0000-000000000002', 'Travail d''équipe', 7),
    ('00000000-0000-0000-0000-000000000002', 'Capacité d''apprentissage', 8),
    ('00000000-0000-0000-0000-000000000002', 'Organisation', 9),
    ('00000000-0000-0000-0000-000000000002', 'Adaptabilité', 10),
    ('00000000-0000-0000-0000-000000000002', 'Autonomie', 11),
    ('00000000-0000-0000-0000-000000000002', 'Projet professionnel', 12),
    ('00000000-0000-0000-0000-000000000002', 'Techniques de recherche d''emploi', 13)
  RETURNING id, name
)
INSERT INTO public.skills (theme_id, name, definition, order_index)
SELECT t.id, s.name, s.definition, s.order_index
FROM t
JOIN (VALUES
  ('Engagement', 0, 'Assiduité', 'Est présent et s''investit pleinement dans ce qu''il fait. Fait preuve de motivation et de régularité.'),
  ('Engagement', 1, 'Ponctualité', 'Arrive en avance de manière à commencer à l''heure.'),
  ('Engagement', 2, 'Fiabilité', 'Tient sa parole et s''assure de bien faire les choses, permettant de gagner la confiance de l''autre.'),
  ('Respect', 0, 'Respect des autres', 'Accepte et respecte une forme d''autorité, de hiérarchie. Sait écouter, respecte les opinions différentes, fait preuve d''humilité.'),
  ('Respect', 1, 'Respect des règles', 'Comprend l''intérêt des règles nécessaires au bon fonctionnement d''un groupe, d''une activité, de la société et les applique.'),
  ('Respect', 2, 'Respect de l''environnement', 'Prend soin des lieux, du matériel mis à disposition, range avant de partir.'),
  ('Aptitudes physiques', 0, 'Hygiène de vie', 'Prend soin de lui pour préserver son capital santé, gérer son sommeil, son alimentation, ses consommations (tabac, drogue, jeux, portable).'),
  ('Aptitudes physiques', 1, 'Posture / Dynamisme', 'A une attitude corporelle adaptée pour renvoyer une image positive (y compris sur les réseaux sociaux).'),
  ('Aptitudes physiques', 2, 'Capacités physiques (force, endurance, coordination, précision)', 'Sait mobiliser, entretenir et développer ses ressources physiques.'),
  ('Confiance en soi', 0, 'Connaissance de soi', 'Sait valoriser ses points forts, identifier ses points faibles.'),
  ('Confiance en soi', 1, 'Estime de soi / Acceptation de son image', 'A confiance dans ses capacités d''apprentissages et d''actions.'),
  ('Dépassement de soi', 0, 'Goût de l''effort / Prise de risque', 'Sait se lancer des défis, sortir de sa zone de confort pour atteindre ses objectifs.'),
  ('Dépassement de soi', 1, 'Détermination / Persévérance', 'Fait preuve de ténacité pour surmonter les obstacles sans baisser les bras face aux difficultés.'),
  ('Gestion des émotions', 0, 'Gestion du stress', 'Parvient à surmonter ses peurs pour atteindre un objectif.'),
  ('Gestion des émotions', 1, 'Maîtrise de soi / Prise de recul', 'Gère ses sentiments positifs ou négatifs (joie, colère, tristesse), maîtrise ses réactions face à une injustice ou à un conflit, garde un comportement correct et adéquat.'),
  ('Communication', 0, 'Expression de soi (verbale et non verbale)', 'Sait s''exprimer, faire passer ses idées et ses ressentis de manière claire (verbale et non verbale), tout en s''assurant que les informations soient bien passées.'),
  ('Communication', 1, 'Écoute de l''autre', 'Est attentif à ce que l''autre exprime dans ses paroles et dans son comportement.'),
  ('Travail d''équipe', 0, 'Coopération / Solidarité', 'S''associe avec les autres pour avancer vers un objectif commun. Soutient une personne, un groupe pour l''aider à progresser ou pour le réconforter ou l''encourager.'),
  ('Travail d''équipe', 1, 'Prise d''initiative', 'Prend des initiatives personnelles pour faire avancer le collectif.'),
  ('Travail d''équipe', 2, 'Leadership', 'Fédère le groupe.'),
  ('Capacité d''apprentissage', 0, 'Concentration / Mémorisation', 'Reste attentif sans se laisser distraire. Sait observer son environnement, prendre des notes, cibler les informations utiles et mémoriser les points essentiels.'),
  ('Capacité d''apprentissage', 1, 'Curiosité', 'Fait preuve de curiosité intellectuelle, d''envie d''apprendre de nouvelles choses.'),
  ('Organisation', 0, 'Gestion de l''information / Compréhension des consignes', 'Sait analyser et hiérarchiser les informations récoltées pour définir une stratégie pertinente et passer à l''action au bon moment.'),
  ('Organisation', 1, 'Vision stratégique / Gestion des tâches dans le temps', 'Planifie son action dans le temps en se fixant des objectifs intermédiaires.'),
  ('Adaptabilité', 0, 'Ouverture d''esprit', 'Prend en compte les différences de chacun et cherche à les connaître. Exprime ses idées et opinions personnelles en étant ouvert à la discussion.'),
  ('Adaptabilité', 1, 'Intégration dans un groupe', 'Sait adapter son langage, sa tenue, sa posture, en fonction de son interlocuteur et de la culture de l''entreprise.'),
  ('Adaptabilité', 2, 'Créativité', 'Crée des connexions entre les idées, les gens. Imagine des réponses innovantes à des situations nouvelles.'),
  ('Autonomie', 0, 'Administrative', 'Met à jour ses démarches administratives (papiers d''identité, carte vitale, carte de séjour, inscription pôle emploi…) préalables à l''embauche ou à la formation professionnelle.'),
  ('Autonomie', 1, 'Mobilité', 'Sait se déplacer avec les moyens disponibles dans son environnement, ou s''en donne les moyens.'),
  ('Autonomie', 2, 'Informatique', 'Est à l''aise avec les outils bureautiques et numériques nécessaires pour entrer en contact et travailler avec le monde professionnel.'),
  ('Projet professionnel', 0, 'Connaissance de ses aspirations', 'A identifié et validé un ou plusieurs projets professionnels correspondant à ses aspirations et les démarches à mettre en œuvre pour le réaliser.'),
  ('Techniques de recherche d''emploi', 0, 'Supports de présentation pro (CV, lettre de motivation)', 'Comprend et sait utiliser les outils de recherche d''emploi (CV, CV vidéo, lettre de motivation…).'),
  ('Techniques de recherche d''emploi', 1, 'Entretien d''embauche', 'Sait pitcher son projet professionnel, mettre en avant ses qualités en adaptant son discours à une entreprise visée.'),
  ('Techniques de recherche d''emploi', 2, 'Démarches de prospection', 'Sait prospecter pour trouver des informations et un emploi en lien avec son projet professionnel (forum, réseau, candidature spontanée…).')
) AS s(theme_name, order_index, name, definition) ON s.theme_name = t.name;
