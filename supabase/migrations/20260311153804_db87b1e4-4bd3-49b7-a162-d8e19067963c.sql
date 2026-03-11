
-- =============================================
-- Convert ALL RESTRICTIVE RLS policies to PERMISSIVE
-- PostgreSQL does not support ALTER POLICY to change this,
-- so we must DROP and recreate each policy.
-- =============================================

-- ============ TABLE: skills ============

DROP POLICY IF EXISTS "Admins can manage all skills" ON public.skills;
CREATE POLICY "Admins can manage all skills" ON public.skills FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can view skills" ON public.skills;
CREATE POLICY "Authenticated users can view skills" ON public.skills FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Club admin manage club framework skills" ON public.skills;
CREATE POLICY "Club admin manage club framework skills" ON public.skills FOR ALL TO public USING (theme_id IN (SELECT th.id FROM themes th JOIN competence_frameworks cf ON th.framework_id = cf.id WHERE cf.club_id IS NOT NULL AND cf.team_id IS NULL AND is_club_admin(auth.uid(), cf.club_id))) WITH CHECK (theme_id IN (SELECT th.id FROM themes th JOIN competence_frameworks cf ON th.framework_id = cf.id WHERE cf.club_id IS NOT NULL AND cf.team_id IS NULL AND is_club_admin(auth.uid(), cf.club_id)));

DROP POLICY IF EXISTS "Club admin manage skills" ON public.skills;
CREATE POLICY "Club admin manage skills" ON public.skills FOR ALL TO authenticated USING (theme_id IN (SELECT th.id FROM themes th JOIN competence_frameworks cf ON th.framework_id = cf.id JOIN teams t ON cf.team_id = t.id WHERE is_club_admin(auth.uid(), t.club_id))) WITH CHECK (theme_id IN (SELECT th.id FROM themes th JOIN competence_frameworks cf ON th.framework_id = cf.id JOIN teams t ON cf.team_id = t.id WHERE is_club_admin(auth.uid(), t.club_id)));

DROP POLICY IF EXISTS "Referent coach manage skills" ON public.skills;
CREATE POLICY "Referent coach manage skills" ON public.skills FOR ALL TO authenticated USING (theme_id IN (SELECT th.id FROM themes th JOIN competence_frameworks cf ON th.framework_id = cf.id WHERE cf.team_id IN (SELECT get_referent_coach_team_ids(auth.uid())))) WITH CHECK (theme_id IN (SELECT th.id FROM themes th JOIN competence_frameworks cf ON th.framework_id = cf.id WHERE cf.team_id IN (SELECT get_referent_coach_team_ids(auth.uid()))));

-- ============ TABLE: supporters_link ============

DROP POLICY IF EXISTS "Admin full access to supporters_link" ON public.supporters_link;
CREATE POLICY "Admin full access to supporters_link" ON public.supporters_link FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can manage supporter links" ON public.supporters_link;
CREATE POLICY "Admins can manage supporter links" ON public.supporters_link FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Club admin manage supporters" ON public.supporters_link;
CREATE POLICY "Club admin manage supporters" ON public.supporters_link FOR ALL TO authenticated USING (player_id IN (SELECT p.id FROM profiles p WHERE p.club_id IN (SELECT ur.club_id FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'club_admin'::app_role))) WITH CHECK (player_id IN (SELECT p.id FROM profiles p WHERE p.club_id IN (SELECT ur.club_id FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'club_admin'::app_role)));

DROP POLICY IF EXISTS "Coaches manage supporters for their players" ON public.supporters_link;
CREATE POLICY "Coaches manage supporters for their players" ON public.supporters_link FOR ALL TO authenticated USING (player_id IN (SELECT get_coach_player_ids(auth.uid()))) WITH CHECK (player_id IN (SELECT get_coach_player_ids(auth.uid())));

DROP POLICY IF EXISTS "Supporters can view their links" ON public.supporters_link;
CREATE POLICY "Supporters can view their links" ON public.supporters_link FOR SELECT TO authenticated USING (supporter_id = auth.uid());

DROP POLICY IF EXISTS "Supporters view their links" ON public.supporters_link;
CREATE POLICY "Supporters view their links" ON public.supporters_link FOR SELECT TO authenticated USING (supporter_id = auth.uid());

-- ============ TABLE: role_requests ============

DROP POLICY IF EXISTS "Admins manage requests" ON public.role_requests;
CREATE POLICY "Admins manage requests" ON public.role_requests FOR UPDATE TO public USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins view all requests" ON public.role_requests;
CREATE POLICY "Admins view all requests" ON public.role_requests FOR SELECT TO public USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Users create own requests" ON public.role_requests;
CREATE POLICY "Users create own requests" ON public.role_requests FOR INSERT TO public WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users view own requests" ON public.role_requests;
CREATE POLICY "Users view own requests" ON public.role_requests FOR SELECT TO public USING (user_id = auth.uid());

-- ============ TABLE: competence_frameworks ============

DROP POLICY IF EXISTS "Admin full access to frameworks" ON public.competence_frameworks;
CREATE POLICY "Admin full access to frameworks" ON public.competence_frameworks FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Club admin manage frameworks" ON public.competence_frameworks;
CREATE POLICY "Club admin manage frameworks" ON public.competence_frameworks FOR ALL TO authenticated USING (is_club_admin(auth.uid(), club_id)) WITH CHECK (is_club_admin(auth.uid(), club_id));

DROP POLICY IF EXISTS "Referent coach manage team framework" ON public.competence_frameworks;
CREATE POLICY "Referent coach manage team framework" ON public.competence_frameworks FOR ALL TO authenticated USING (is_referent_coach_of_team(auth.uid(), team_id)) WITH CHECK (is_referent_coach_of_team(auth.uid(), team_id));

DROP POLICY IF EXISTS "Supporters view framework of linked players" ON public.competence_frameworks;
CREATE POLICY "Supporters view framework of linked players" ON public.competence_frameworks FOR SELECT TO authenticated USING (team_id IN (SELECT get_supporter_player_team_ids(auth.uid())));

DROP POLICY IF EXISTS "Team members view framework" ON public.competence_frameworks;
CREATE POLICY "Team members view framework" ON public.competence_frameworks FOR SELECT TO authenticated USING (is_template = true OR team_id IN (SELECT get_user_team_ids(auth.uid())));

-- ============ TABLE: evaluation_scores ============

DROP POLICY IF EXISTS "Club admins can view evaluation scores in their club" ON public.evaluation_scores;
CREATE POLICY "Club admins can view evaluation scores in their club" ON public.evaluation_scores FOR SELECT TO public USING (is_admin(auth.uid()) OR EXISTS (SELECT 1 FROM evaluations e JOIN profiles p ON p.id = e.player_id WHERE e.id = evaluation_scores.evaluation_id AND p.club_id IS NOT NULL AND is_club_admin(auth.uid(), p.club_id)));

DROP POLICY IF EXISTS "Supporters can manage their evaluation scores" ON public.evaluation_scores;
CREATE POLICY "Supporters can manage their evaluation scores" ON public.evaluation_scores FOR ALL TO public USING (evaluation_id IN (SELECT evaluations.id FROM evaluations WHERE evaluations.type = 'supporter_assessment'::evaluation_type AND evaluations.coach_id = auth.uid())) WITH CHECK (evaluation_id IN (SELECT evaluations.id FROM evaluations WHERE evaluations.type = 'supporter_assessment'::evaluation_type AND evaluations.coach_id = auth.uid()));

DROP POLICY IF EXISTS "Supporters can view evaluation scores for linked players" ON public.evaluation_scores;
CREATE POLICY "Supporters can view evaluation scores for linked players" ON public.evaluation_scores FOR SELECT TO authenticated USING (evaluation_id IN (SELECT evaluations.id FROM evaluations WHERE is_supporter_of_player(auth.uid(), evaluations.player_id) AND evaluations.type <> 'player_self_assessment'::evaluation_type));

DROP POLICY IF EXISTS "Users can manage evaluation scores" ON public.evaluation_scores;
CREATE POLICY "Users can manage evaluation scores" ON public.evaluation_scores FOR ALL TO public USING (evaluation_id IN (SELECT evaluations.id FROM evaluations WHERE (evaluations.coach_id = auth.uid() AND evaluations.type = 'coach_assessment'::evaluation_type) OR (evaluations.player_id = auth.uid() AND evaluations.type = 'player_self_assessment'::evaluation_type AND evaluations.coach_id = auth.uid()))) WITH CHECK (evaluation_id IN (SELECT evaluations.id FROM evaluations WHERE (evaluations.coach_id = auth.uid() AND evaluations.type = 'coach_assessment'::evaluation_type) OR (evaluations.player_id = auth.uid() AND evaluations.type = 'player_self_assessment'::evaluation_type AND evaluations.coach_id = auth.uid())));

DROP POLICY IF EXISTS "Users can view evaluation scores" ON public.evaluation_scores;
CREATE POLICY "Users can view evaluation scores" ON public.evaluation_scores FOR SELECT TO authenticated USING (evaluation_id IN (SELECT evaluations.id FROM evaluations WHERE evaluations.coach_id = auth.uid() OR evaluations.player_id = auth.uid()) OR is_admin(auth.uid()));

-- ============ TABLE: supporter_evaluation_requests ============

DROP POLICY IF EXISTS "Admins have full access to supporter evaluation requests" ON public.supporter_evaluation_requests;
CREATE POLICY "Admins have full access to supporter evaluation requests" ON public.supporter_evaluation_requests FOR ALL TO public USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Club admins can manage supporter evaluation requests" ON public.supporter_evaluation_requests;
CREATE POLICY "Club admins can manage supporter evaluation requests" ON public.supporter_evaluation_requests FOR ALL TO public USING (player_id IN (SELECT profiles.id FROM profiles WHERE profiles.club_id IN (SELECT get_user_club_admin_ids(auth.uid())))) WITH CHECK (player_id IN (SELECT profiles.id FROM profiles WHERE profiles.club_id IN (SELECT get_user_club_admin_ids(auth.uid()))));

DROP POLICY IF EXISTS "Coaches can create supporter evaluation requests" ON public.supporter_evaluation_requests;
CREATE POLICY "Coaches can create supporter evaluation requests" ON public.supporter_evaluation_requests FOR INSERT TO public WITH CHECK (requested_by = auth.uid() AND EXISTS (SELECT 1 FROM team_members tm1 JOIN team_members tm2 ON tm1.team_id = tm2.team_id WHERE tm1.user_id = auth.uid() AND tm1.member_type = 'coach' AND tm1.is_active = true AND tm2.user_id = supporter_evaluation_requests.player_id AND tm2.member_type = 'player' AND tm2.is_active = true) AND is_supporter_of_player(supporter_id, player_id));

DROP POLICY IF EXISTS "Coaches can update their evaluation requests" ON public.supporter_evaluation_requests;
CREATE POLICY "Coaches can update their evaluation requests" ON public.supporter_evaluation_requests FOR UPDATE TO public USING (requested_by = auth.uid());

DROP POLICY IF EXISTS "Coaches can view their evaluation requests" ON public.supporter_evaluation_requests;
CREATE POLICY "Coaches can view their evaluation requests" ON public.supporter_evaluation_requests FOR SELECT TO public USING (requested_by = auth.uid());

DROP POLICY IF EXISTS "Supporters can update their own requests" ON public.supporter_evaluation_requests;
CREATE POLICY "Supporters can update their own requests" ON public.supporter_evaluation_requests FOR UPDATE TO public USING (supporter_id = auth.uid()) WITH CHECK (supporter_id = auth.uid());

DROP POLICY IF EXISTS "Supporters can view their pending requests" ON public.supporter_evaluation_requests;
CREATE POLICY "Supporters can view their pending requests" ON public.supporter_evaluation_requests FOR SELECT TO public USING (supporter_id = auth.uid());

-- ============ TABLE: evaluations ============

DROP POLICY IF EXISTS "Club admins can view evaluations in their club" ON public.evaluations;
CREATE POLICY "Club admins can view evaluations in their club" ON public.evaluations FOR SELECT TO public USING (is_admin(auth.uid()) OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = evaluations.player_id AND p.club_id IS NOT NULL AND is_club_admin(auth.uid(), p.club_id)));

DROP POLICY IF EXISTS "Supporters can create evaluations for their linked players" ON public.evaluations;
CREATE POLICY "Supporters can create evaluations for their linked players" ON public.evaluations FOR INSERT TO public WITH CHECK (type = 'supporter_assessment'::evaluation_type AND coach_id = auth.uid() AND is_supporter_of_player(auth.uid(), player_id));

DROP POLICY IF EXISTS "Supporters can update their own evaluations" ON public.evaluations;
CREATE POLICY "Supporters can update their own evaluations" ON public.evaluations FOR UPDATE TO public USING (type = 'supporter_assessment'::evaluation_type AND coach_id = auth.uid() AND is_supporter_of_player(auth.uid(), player_id)) WITH CHECK (type = 'supporter_assessment'::evaluation_type AND coach_id = auth.uid() AND is_supporter_of_player(auth.uid(), player_id));

DROP POLICY IF EXISTS "Supporters can view evaluations for their linked players" ON public.evaluations;
CREATE POLICY "Supporters can view evaluations for their linked players" ON public.evaluations FOR SELECT TO authenticated USING (is_supporter_of_player(auth.uid(), player_id) AND type <> 'player_self_assessment'::evaluation_type);

DROP POLICY IF EXISTS "Users can create evaluations" ON public.evaluations;
CREATE POLICY "Users can create evaluations" ON public.evaluations FOR INSERT TO public WITH CHECK ((coach_id = auth.uid() AND type = 'coach_assessment'::evaluation_type) OR (player_id = auth.uid() AND type = 'player_self_assessment'::evaluation_type AND coach_id = auth.uid()));

DROP POLICY IF EXISTS "Users can soft delete their evaluations" ON public.evaluations;
CREATE POLICY "Users can soft delete their evaluations" ON public.evaluations FOR UPDATE TO public USING (coach_id = auth.uid() OR (player_id = auth.uid() AND type = 'player_self_assessment'::evaluation_type)) WITH CHECK (coach_id = auth.uid() OR (player_id = auth.uid() AND type = 'player_self_assessment'::evaluation_type));

DROP POLICY IF EXISTS "Users can update their evaluations" ON public.evaluations;
CREATE POLICY "Users can update their evaluations" ON public.evaluations FOR UPDATE TO public USING ((coach_id = auth.uid() AND type = 'coach_assessment'::evaluation_type) OR (player_id = auth.uid() AND type = 'player_self_assessment'::evaluation_type AND coach_id = auth.uid())) WITH CHECK ((coach_id = auth.uid() AND type = 'coach_assessment'::evaluation_type) OR (player_id = auth.uid() AND type = 'player_self_assessment'::evaluation_type AND coach_id = auth.uid()));

DROP POLICY IF EXISTS "Users can view evaluations" ON public.evaluations;
CREATE POLICY "Users can view evaluations" ON public.evaluations FOR SELECT TO authenticated USING (coach_id = auth.uid() OR player_id = auth.uid() OR is_admin(auth.uid()) OR (type = 'player_self_assessment'::evaluation_type AND is_coach_of_player(auth.uid(), player_id)));

-- ============ TABLE: user_roles ============

DROP POLICY IF EXISTS "Admin full access to user_roles" ON public.user_roles;
CREATE POLICY "Admin full access to user_roles" ON public.user_roles FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Club admin manage roles in club" ON public.user_roles;
CREATE POLICY "Club admin manage roles in club" ON public.user_roles FOR ALL TO authenticated USING (role <> 'admin'::app_role AND club_id IN (SELECT get_user_club_admin_ids(auth.uid()))) WITH CHECK (role <> 'admin'::app_role AND club_id IN (SELECT get_user_club_admin_ids(auth.uid())));

DROP POLICY IF EXISTS "Users view own roles" ON public.user_roles;
CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ============ TABLE: team_members ============

DROP POLICY IF EXISTS "Admin full access to team_members" ON public.team_members;
CREATE POLICY "Admin full access to team_members" ON public.team_members FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Club admin delete team_members" ON public.team_members;
CREATE POLICY "Club admin delete team_members" ON public.team_members FOR DELETE TO authenticated USING (is_club_admin_of_team(auth.uid(), team_id));

DROP POLICY IF EXISTS "Club admin insert team_members" ON public.team_members;
CREATE POLICY "Club admin insert team_members" ON public.team_members FOR INSERT TO authenticated WITH CHECK (is_club_admin_of_team(auth.uid(), team_id));

DROP POLICY IF EXISTS "Club admin update team_members" ON public.team_members;
CREATE POLICY "Club admin update team_members" ON public.team_members FOR UPDATE TO authenticated USING (is_club_admin_of_team(auth.uid(), team_id)) WITH CHECK (is_club_admin_of_team(auth.uid(), team_id));

DROP POLICY IF EXISTS "Club admin view team_members" ON public.team_members;
CREATE POLICY "Club admin view team_members" ON public.team_members FOR SELECT TO authenticated USING (is_club_admin_of_team(auth.uid(), team_id));

DROP POLICY IF EXISTS "Supporters view team_members of linked players" ON public.team_members;
CREATE POLICY "Supporters view team_members of linked players" ON public.team_members FOR SELECT TO authenticated USING (is_active = true AND user_id IN (SELECT sl.player_id FROM supporters_link sl WHERE sl.supporter_id = auth.uid()));

DROP POLICY IF EXISTS "Users can view own team membership" ON public.team_members;
CREATE POLICY "Users can view own team membership" ON public.team_members FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ============ TABLE: invitations ============

DROP POLICY IF EXISTS "Admin full access to invitations" ON public.invitations;
CREATE POLICY "Admin full access to invitations" ON public.invitations FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Club admin manage invitations" ON public.invitations;
CREATE POLICY "Club admin manage invitations" ON public.invitations FOR ALL TO authenticated USING (is_club_admin(auth.uid(), club_id)) WITH CHECK (is_club_admin(auth.uid(), club_id));

DROP POLICY IF EXISTS "Coaches create invitations" ON public.invitations;
CREATE POLICY "Coaches create invitations" ON public.invitations FOR INSERT TO authenticated WITH CHECK (intended_role = ANY (ARRAY['player'::app_role, 'supporter'::app_role]) AND team_id IN (SELECT tm.team_id FROM team_members tm WHERE tm.user_id = auth.uid() AND tm.member_type = 'coach' AND tm.is_active = true));

DROP POLICY IF EXISTS "Users view sent invitations" ON public.invitations;
CREATE POLICY "Users view sent invitations" ON public.invitations FOR SELECT TO authenticated USING (invited_by = auth.uid());

-- ============ TABLE: evaluation_objectives ============

DROP POLICY IF EXISTS "Club admins can view evaluation objectives in their club" ON public.evaluation_objectives;
CREATE POLICY "Club admins can view evaluation objectives in their club" ON public.evaluation_objectives FOR SELECT TO public USING (is_admin(auth.uid()) OR EXISTS (SELECT 1 FROM evaluations e JOIN profiles p ON p.id = e.player_id WHERE e.id = evaluation_objectives.evaluation_id AND p.club_id IS NOT NULL AND is_club_admin(auth.uid(), p.club_id)));

DROP POLICY IF EXISTS "Users can manage evaluation objectives" ON public.evaluation_objectives;
CREATE POLICY "Users can manage evaluation objectives" ON public.evaluation_objectives FOR ALL TO public USING (evaluation_id IN (SELECT evaluations.id FROM evaluations WHERE (evaluations.coach_id = auth.uid() AND evaluations.type = 'coach_assessment'::evaluation_type) OR (evaluations.player_id = auth.uid() AND evaluations.type = 'player_self_assessment'::evaluation_type AND evaluations.coach_id = auth.uid()))) WITH CHECK (evaluation_id IN (SELECT evaluations.id FROM evaluations WHERE (evaluations.coach_id = auth.uid() AND evaluations.type = 'coach_assessment'::evaluation_type) OR (evaluations.player_id = auth.uid() AND evaluations.type = 'player_self_assessment'::evaluation_type AND evaluations.coach_id = auth.uid())));

DROP POLICY IF EXISTS "Users can view evaluation objectives" ON public.evaluation_objectives;
CREATE POLICY "Users can view evaluation objectives" ON public.evaluation_objectives FOR SELECT TO authenticated USING (evaluation_id IN (SELECT evaluations.id FROM evaluations WHERE evaluations.coach_id = auth.uid() OR evaluations.player_id = auth.uid()) OR is_admin(auth.uid()));

-- ============ TABLE: themes ============

DROP POLICY IF EXISTS "Admins can manage all themes" ON public.themes;
CREATE POLICY "Admins can manage all themes" ON public.themes FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can view themes" ON public.themes;
CREATE POLICY "Authenticated users can view themes" ON public.themes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Club admin manage club framework themes" ON public.themes;
CREATE POLICY "Club admin manage club framework themes" ON public.themes FOR ALL TO public USING (framework_id IN (SELECT cf.id FROM competence_frameworks cf WHERE cf.club_id IS NOT NULL AND cf.team_id IS NULL AND is_club_admin(auth.uid(), cf.club_id))) WITH CHECK (framework_id IN (SELECT cf.id FROM competence_frameworks cf WHERE cf.club_id IS NOT NULL AND cf.team_id IS NULL AND is_club_admin(auth.uid(), cf.club_id)));

DROP POLICY IF EXISTS "Club admin manage themes" ON public.themes;
CREATE POLICY "Club admin manage themes" ON public.themes FOR ALL TO authenticated USING (framework_id IN (SELECT cf.id FROM competence_frameworks cf JOIN teams t ON cf.team_id = t.id WHERE is_club_admin(auth.uid(), t.club_id))) WITH CHECK (framework_id IN (SELECT cf.id FROM competence_frameworks cf JOIN teams t ON cf.team_id = t.id WHERE is_club_admin(auth.uid(), t.club_id)));

DROP POLICY IF EXISTS "Referent coach manage themes" ON public.themes;
CREATE POLICY "Referent coach manage themes" ON public.themes FOR ALL TO authenticated USING (framework_id IN (SELECT cf.id FROM competence_frameworks cf WHERE cf.team_id IN (SELECT get_referent_coach_team_ids(auth.uid())))) WITH CHECK (framework_id IN (SELECT cf.id FROM competence_frameworks cf WHERE cf.team_id IN (SELECT get_referent_coach_team_ids(auth.uid()))));

-- ============ TABLE: profiles ============

DROP POLICY IF EXISTS "Admin full access to profiles" ON public.profiles;
CREATE POLICY "Admin full access to profiles" ON public.profiles FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Club admin update profiles in club" ON public.profiles;
CREATE POLICY "Club admin update profiles in club" ON public.profiles FOR UPDATE TO authenticated USING (club_id IN (SELECT ur.club_id FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'club_admin'::app_role)) WITH CHECK (club_id IN (SELECT ur.club_id FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'club_admin'::app_role));

DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "Users view profiles in scope" ON public.profiles;
CREATE POLICY "Users view profiles in scope" ON public.profiles FOR SELECT TO authenticated USING (deleted_at IS NULL AND (id = auth.uid() OR club_id IN (SELECT get_user_club_ids(auth.uid())) OR id IN (SELECT get_teammate_user_ids(auth.uid())) OR is_supporter_of_player(auth.uid(), id)));

-- ============ TABLE: clubs ============

DROP POLICY IF EXISTS "Admin full access to clubs" ON public.clubs;
CREATE POLICY "Admin full access to clubs" ON public.clubs FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Club admin update their club" ON public.clubs;
CREATE POLICY "Club admin update their club" ON public.clubs FOR UPDATE TO authenticated USING (is_club_admin(auth.uid(), id)) WITH CHECK (is_club_admin(auth.uid(), id));

DROP POLICY IF EXISTS "Club admin view their club" ON public.clubs;
CREATE POLICY "Club admin view their club" ON public.clubs FOR SELECT TO authenticated USING (deleted_at IS NULL AND id IN (SELECT get_user_club_ids(auth.uid())));

DROP POLICY IF EXISTS "Supporters can view linked clubs" ON public.clubs;
CREATE POLICY "Supporters can view linked clubs" ON public.clubs FOR SELECT TO authenticated USING (id IN (SELECT t.club_id FROM teams t WHERE t.id IN (SELECT get_supporter_player_team_ids(auth.uid()))));

-- ============ TABLE: teams ============

DROP POLICY IF EXISTS "Admin full access to teams" ON public.teams;
CREATE POLICY "Admin full access to teams" ON public.teams FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Club admin manage teams" ON public.teams;
CREATE POLICY "Club admin manage teams" ON public.teams FOR ALL TO authenticated USING (is_club_admin(auth.uid(), club_id)) WITH CHECK (is_club_admin(auth.uid(), club_id));

DROP POLICY IF EXISTS "Coaches view their teams" ON public.teams;
CREATE POLICY "Coaches view their teams" ON public.teams FOR SELECT TO authenticated USING (deleted_at IS NULL AND is_coach_of_team(auth.uid(), id));

DROP POLICY IF EXISTS "Players view their team" ON public.teams;
CREATE POLICY "Players view their team" ON public.teams FOR SELECT TO authenticated USING (deleted_at IS NULL AND is_player_in_team(auth.uid(), id));

DROP POLICY IF EXISTS "Referent coach update team" ON public.teams;
CREATE POLICY "Referent coach update team" ON public.teams FOR UPDATE TO authenticated USING (is_referent_coach_of_team(auth.uid(), id)) WITH CHECK (is_referent_coach_of_team(auth.uid(), id));

DROP POLICY IF EXISTS "Supporters can view linked teams" ON public.teams;
CREATE POLICY "Supporters can view linked teams" ON public.teams FOR SELECT TO authenticated USING (id IN (SELECT get_supporter_player_team_ids(auth.uid())));
