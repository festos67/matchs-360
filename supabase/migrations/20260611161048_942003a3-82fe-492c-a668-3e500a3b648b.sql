
INSERT INTO public.competence_frameworks (id, name, is_template, team_id, club_id)
VALUES ('00000000-0000-0000-0000-000000000004', 'Modèle « Socio-Sport Enfant » (6-12 ans)', true, NULL, NULL)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, is_template = true, is_archived = false;

DELETE FROM public.themes WHERE framework_id = '00000000-0000-0000-0000-000000000004';

-- Themes
INSERT INTO public.themes (id, framework_id, name, color, order_index) VALUES
 ('00000000-0000-0000-0004-000000000001','00000000-0000-0000-0000-000000000004','A — Mon rapport au jeu','#BAD9F2',0),
 ('00000000-0000-0000-0004-000000000002','00000000-0000-0000-0000-000000000004','B — Engagement et respect','#B5E0D3',1),
 ('00000000-0000-0000-0004-000000000003','00000000-0000-0000-0000-000000000004','C — Mes émotions','#FCD9B6',2),
 ('00000000-0000-0000-0004-000000000004','00000000-0000-0000-0000-000000000004','D — Avec les autres','#C8E6B8',3),
 ('00000000-0000-0000-0004-000000000005','00000000-0000-0000-0000-000000000004','E — J''apprends et je m''adapte','#C4B5FD',4),
 ('00000000-0000-0000-0004-000000000006','00000000-0000-0000-0000-000000000004','H — Mon comportement','#FAE6A0',5);

-- Skills
INSERT INTO public.skills (theme_id, name, definition, order_index) VALUES
 ('00000000-0000-0000-0004-000000000001','Je suis bien dans mon corps (hygiène de vie)','Boit à sa gourde aux pauses sans rappel, récupère après l''effort et sait dire ce qui l''aide à bien jouer (sommeil, alimentation, écrans).',0),
 ('00000000-0000-0000-0004-000000000001','Je reproduis et je m''améliore (capacités individuelles)','Enchaîne des actions motrices (courir-lancer, dribbler-passer), reproduit le geste montré et l''ajuste d''un essai à l''autre.',1),
 ('00000000-0000-0000-0004-000000000001','Je joue avec les autres (capacités collectives)','Lève la tête, passe la balle aux camarades démarqués ou qui la demandent et tient le rôle confié dans le jeu.',2),
 ('00000000-0000-0000-0004-000000000001','Je m''investis à l''entraînement','Se met en activité dès la consigne, essaie chaque exercice même nouveau et reste impliqué(e) jusqu''au signal de fin.',3),
 ('00000000-0000-0000-0004-000000000001','Je progresse (progression sportive)','Réussit des gestes qui le/la mettaient en échec auparavant, sait dire ce qu''il/elle a amélioré et le réutilise dans le jeu.',4),
 ('00000000-0000-0000-0004-000000000001','Je joue jusqu''au bout','Joue la rencontre du début à la fin quel que soit le score, tente des actions même quand son équipe est menée et essaie différents postes.',5),

 ('00000000-0000-0000-0004-000000000002','Mon engagement','Vient régulièrement, arrive prêt(e) (tenue, affaires) et se porte volontaire quand l''éducateur cherche quelqu''un.',0),
 ('00000000-0000-0000-0004-000000000002','Le respect','Applique les règles du jeu, accepte les décisions de l''éducateur et de l''arbitre même défavorables, et reprend le jeu sans bouder.',1),

 ('00000000-0000-0000-0004-000000000003','Confiance en soi','Ose essayer et montrer un geste devant le groupe, passe en premier quand on le propose et sait nommer une réussite personnelle.',0),
 ('00000000-0000-0000-0004-000000000003','Mes émotions au jeu (gestion des émotions)','Après une frustration (faute, échec, défaite), se calme seul(e) ou avec l''aide de l''adulte, met des mots plutôt que des gestes et revient au jeu.',1),
 ('00000000-0000-0000-0004-000000000003','Oser et persévérer (dépassement de soi)','Retente après un échec en modifiant sa façon de faire, choisit parfois l''option difficile et va au bout de ce qui est commencé.',2),

 ('00000000-0000-0000-0004-000000000004','Je communique','Sait se faire comprendre, attend son tour pour parler et redit la consigne avec ses mots quand on le lui demande.',0),
 ('00000000-0000-0000-0004-000000000004','Le travail d''équipe','Aide un camarade en difficulté, montre aux autres comment réussir et accepte de changer d''équipe sans protester.',1),
 ('00000000-0000-0000-0004-000000000004','Aller vers les autres','Va de lui/d''elle-même vers les camarades pour jouer ou proposer, et ose s''adresser à un adulte pour demander.',2),
 ('00000000-0000-0000-0004-000000000004','Partager et inclure','Partage le matériel, passe la balle à ceux qui jouent moins et accepte dans son groupe les camarades laissés de côté.',3),
 ('00000000-0000-0000-0004-000000000004','Attention à l''autre','Remarque un camarade triste, blessé ou en difficulté, va le voir ou l''aide, et prévient l''adulte si c''est sérieux.',4),

 ('00000000-0000-0000-0004-000000000005','Capacité d''apprentissage','Regarde et écoute pendant les consignes courtes, se souvient des règles déjà vues et pose des questions quand il/elle ne comprend pas.',0),
 ('00000000-0000-0000-0004-000000000005','Je m''organise','Se place au bon endroit à la mise en place des jeux, suit la consigne sans rappel et retrouve ses affaires en fin de séance.',1),
 ('00000000-0000-0000-0004-000000000005','Je m''adapte','Accepte les changements de règle, d''équipe ou d''imprévu sans bloquer le jeu, et accepte de jouer avec les nouveaux venus.',2),
 ('00000000-0000-0000-0004-000000000005','Autonomie du quotidien sportif','Prépare et porte son sac, s''équipe seul(e) (laçage dès 8 ans) et gère ses affaires au vestiaire sans les perdre.',3),
 ('00000000-0000-0000-0004-000000000005','Mes envies et mes rêves','Dit ce qu''il/elle préfère dans son sport et exprime des envies ou des rêves sportifs (modèle, défi, activité à essayer).',4),

 ('00000000-0000-0000-0004-000000000006','Politesse du quotidien','Dit bonjour en arrivant, merci quand on l''aide ou lui prête du matériel, et au revoir en partant.',0),
 ('00000000-0000-0000-0004-000000000006','Sécurité','Applique les consignes de sécurité (matériel, espace, gestes dangereux) et signale ce qui lui paraît dangereux.',1),
 ('00000000-0000-0000-0004-000000000006','Patience et tour de rôle','Attend son tour dans les files et rotations sans bousculer ni doubler, et s''élance au bon moment.',2),
 ('00000000-0000-0000-0004-000000000006','Je donne un coup de main','Aide à installer et ranger le matériel, participe aux événements du club et montre un exercice à un plus jeune quand on le lui propose.',3);
