-- Insert the standard template framework
INSERT INTO public.competence_frameworks (id, team_id, club_id, name, is_template)
VALUES ('00000000-0000-0000-0000-000000000001', NULL, NULL, 'Modèle Standard MATCHS360', true);

-- Insert themes for standard template
INSERT INTO public.themes (id, framework_id, name, color, order_index) VALUES
('00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0000-000000000001', 'Compétences Sportives', '#3B82F6', 0),
('00000000-0000-0000-0001-000000000002', '00000000-0000-0000-0000-000000000001', 'Soft-skills Fondamentales', '#10B981', 1),
('00000000-0000-0000-0001-000000000003', '00000000-0000-0000-0000-000000000001', 'Soft-skills Mentales', '#F59E0B', 2),
('00000000-0000-0000-0001-000000000004', '00000000-0000-0000-0000-000000000001', 'Soft-skills Relationnelles', '#EF4444', 3),
('00000000-0000-0000-0001-000000000005', '00000000-0000-0000-0000-000000000001', 'Soft-skills Cognitives', '#8B5CF6', 4);

-- Insert skills for Compétences Sportives
INSERT INTO public.skills (theme_id, name, definition, order_index) VALUES
('00000000-0000-0000-0001-000000000001', 'Hygiène de vie', 'Sommeil, alimentation, hydratation, récupération et respect du corps', 0),
('00000000-0000-0000-0001-000000000001', 'Capacités individuelles', 'Maîtrise technique, tactique individuelle, endurance et condition physique', 1),
('00000000-0000-0000-0001-000000000001', 'Capacités collectives', 'Travail en équipe, jeu collectif, placement et coordination', 2),
('00000000-0000-0000-0001-000000000001', 'Investissement', 'Assiduité aux entraînements, implication et effort fourni', 3),
('00000000-0000-0000-0001-000000000001', 'Progression', 'Amélioration observable des performances au fil du temps', 4),
('00000000-0000-0000-0001-000000000001', 'Résultats en compétition', 'Performance et régularité lors des matchs et compétitions', 5);

-- Insert skills for Soft-skills Fondamentales
INSERT INTO public.skills (theme_id, name, definition, order_index) VALUES
('00000000-0000-0000-0001-000000000002', 'Engagement', 'Motivation intrinsèque, ponctualité et présence régulière', 0),
('00000000-0000-0000-0001-000000000002', 'Respect', 'Politesse, respect des règles, des arbitres, des adversaires et des équipiers', 1);

-- Insert skills for Soft-skills Mentales
INSERT INTO public.skills (theme_id, name, definition, order_index) VALUES
('00000000-0000-0000-0001-000000000003', 'Confiance en soi', 'Capacité à croire en ses moyens et à prendre des initiatives', 0),
('00000000-0000-0000-0001-000000000003', 'Gestion des émotions', 'Maîtrise du stress, de la frustration et de la pression', 1),
('00000000-0000-0000-0001-000000000003', 'Dépassement de soi', 'Capacité à repousser ses limites et à persévérer', 2);

-- Insert skills for Soft-skills Relationnelles
INSERT INTO public.skills (theme_id, name, definition, order_index) VALUES
('00000000-0000-0000-0001-000000000004', 'Communication', 'Expression claire, écoute active et échanges constructifs', 0),
('00000000-0000-0000-0001-000000000004', 'Compétences relationnelles', 'Leadership, solidarité, entraide et esprit d''équipe', 1);

-- Insert skills for Soft-skills Cognitives
INSERT INTO public.skills (theme_id, name, definition, order_index) VALUES
('00000000-0000-0000-0001-000000000005', 'Capacité d''apprentissage', 'Assimilation des consignes et amélioration continue', 0),
('00000000-0000-0000-0001-000000000005', 'Organisation', 'Gestion du temps, préparation et planification', 1),
('00000000-0000-0000-0001-000000000005', 'Adaptabilité', 'Flexibilité face aux changements et aux imprévus', 2);

-- Add coach permissions for framework editing
DROP POLICY IF EXISTS "Coaches view their team framework" ON public.competence_frameworks;

CREATE POLICY "Coaches view their team framework"
ON public.competence_frameworks FOR SELECT
TO authenticated
USING (
    is_template = true
    OR team_id IN (
        SELECT team_id FROM public.team_members 
        WHERE user_id = auth.uid() AND is_active = true
    )
);

-- Coaches manage themes in their team's framework (if referent)
DROP POLICY IF EXISTS "Referent coach manage themes" ON public.themes;
DROP POLICY IF EXISTS "Admins can manage all themes" ON public.themes;

CREATE POLICY "Admins can manage all themes"
ON public.themes FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Referent coach manage themes"
ON public.themes FOR ALL
TO authenticated
USING (
    framework_id IN (
        SELECT cf.id FROM public.competence_frameworks cf
        WHERE cf.team_id IN (
            SELECT tm.team_id FROM public.team_members tm
            WHERE tm.user_id = auth.uid() 
            AND tm.member_type = 'coach'
            AND tm.coach_role = 'referent'
            AND tm.is_active = true
        )
    )
)
WITH CHECK (
    framework_id IN (
        SELECT cf.id FROM public.competence_frameworks cf
        WHERE cf.team_id IN (
            SELECT tm.team_id FROM public.team_members tm
            WHERE tm.user_id = auth.uid() 
            AND tm.member_type = 'coach'
            AND tm.coach_role = 'referent'
            AND tm.is_active = true
        )
    )
);

CREATE POLICY "Club admin manage themes"
ON public.themes FOR ALL
TO authenticated
USING (
    framework_id IN (
        SELECT cf.id FROM public.competence_frameworks cf
        JOIN public.teams t ON cf.team_id = t.id
        WHERE public.is_club_admin(auth.uid(), t.club_id)
    )
)
WITH CHECK (
    framework_id IN (
        SELECT cf.id FROM public.competence_frameworks cf
        JOIN public.teams t ON cf.team_id = t.id
        WHERE public.is_club_admin(auth.uid(), t.club_id)
    )
);

-- Skills policies
DROP POLICY IF EXISTS "Referent coach manage skills" ON public.skills;
DROP POLICY IF EXISTS "Admins can manage all skills" ON public.skills;

CREATE POLICY "Admins can manage all skills"
ON public.skills FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Referent coach manage skills"
ON public.skills FOR ALL
TO authenticated
USING (
    theme_id IN (
        SELECT th.id FROM public.themes th
        JOIN public.competence_frameworks cf ON th.framework_id = cf.id
        WHERE cf.team_id IN (
            SELECT tm.team_id FROM public.team_members tm
            WHERE tm.user_id = auth.uid() 
            AND tm.member_type = 'coach'
            AND tm.coach_role = 'referent'
            AND tm.is_active = true
        )
    )
)
WITH CHECK (
    theme_id IN (
        SELECT th.id FROM public.themes th
        JOIN public.competence_frameworks cf ON th.framework_id = cf.id
        WHERE cf.team_id IN (
            SELECT tm.team_id FROM public.team_members tm
            WHERE tm.user_id = auth.uid() 
            AND tm.member_type = 'coach'
            AND tm.coach_role = 'referent'
            AND tm.is_active = true
        )
    )
);

CREATE POLICY "Club admin manage skills"
ON public.skills FOR ALL
TO authenticated
USING (
    theme_id IN (
        SELECT th.id FROM public.themes th
        JOIN public.competence_frameworks cf ON th.framework_id = cf.id
        JOIN public.teams t ON cf.team_id = t.id
        WHERE public.is_club_admin(auth.uid(), t.club_id)
    )
)
WITH CHECK (
    theme_id IN (
        SELECT th.id FROM public.themes th
        JOIN public.competence_frameworks cf ON th.framework_id = cf.id
        JOIN public.teams t ON cf.team_id = t.id
        WHERE public.is_club_admin(auth.uid(), t.club_id)
    )
);