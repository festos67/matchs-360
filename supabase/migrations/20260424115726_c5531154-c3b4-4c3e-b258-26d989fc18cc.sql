-- F-208: Restrict business RLS policies from public (anon+authenticated) to authenticated only.
-- Service-role policies on email_* and suppressed_emails are intentionally left as TO public
-- because they are filtered by auth.role() = 'service_role'.

-- ============ evaluation_objectives ============
DROP POLICY IF EXISTS "Club admins can view evaluation objectives in their club" ON public.evaluation_objectives;
CREATE POLICY "Club admins can view evaluation objectives in their club"
ON public.evaluation_objectives FOR SELECT TO authenticated
USING (is_admin(auth.uid()) OR (EXISTS (
  SELECT 1 FROM evaluations e
  WHERE e.id = evaluation_objectives.evaluation_id
    AND is_club_admin(auth.uid(), get_player_club_id(e.player_id))
)));

DROP POLICY IF EXISTS "Users can manage evaluation objectives" ON public.evaluation_objectives;
CREATE POLICY "Users can manage evaluation objectives"
ON public.evaluation_objectives FOR ALL TO authenticated
USING (evaluation_id IN (
  SELECT evaluations.id FROM evaluations
  WHERE ((evaluations.evaluator_id = auth.uid()) AND (evaluations.type = 'coach'::evaluation_type))
     OR ((evaluations.player_id = auth.uid()) AND (evaluations.type = 'self'::evaluation_type) AND (evaluations.evaluator_id = auth.uid()))
))
WITH CHECK (evaluation_id IN (
  SELECT evaluations.id FROM evaluations
  WHERE ((evaluations.evaluator_id = auth.uid()) AND (evaluations.type = 'coach'::evaluation_type))
     OR ((evaluations.player_id = auth.uid()) AND (evaluations.type = 'self'::evaluation_type) AND (evaluations.evaluator_id = auth.uid()))
));

-- ============ evaluation_scores ============
DROP POLICY IF EXISTS "Club admins can view evaluation scores in their club" ON public.evaluation_scores;
CREATE POLICY "Club admins can view evaluation scores in their club"
ON public.evaluation_scores FOR SELECT TO authenticated
USING (is_admin(auth.uid()) OR (EXISTS (
  SELECT 1 FROM evaluations e
  WHERE e.id = evaluation_scores.evaluation_id
    AND is_club_admin(auth.uid(), get_player_club_id(e.player_id))
)));

DROP POLICY IF EXISTS "Supporters can manage their evaluation scores" ON public.evaluation_scores;
CREATE POLICY "Supporters can manage their evaluation scores"
ON public.evaluation_scores FOR ALL TO authenticated
USING (evaluation_id IN (
  SELECT evaluations.id FROM evaluations
  WHERE evaluations.type = 'supporter'::evaluation_type AND evaluations.evaluator_id = auth.uid()
))
WITH CHECK (evaluation_id IN (
  SELECT evaluations.id FROM evaluations
  WHERE evaluations.type = 'supporter'::evaluation_type AND evaluations.evaluator_id = auth.uid()
));

DROP POLICY IF EXISTS "Users can manage evaluation scores" ON public.evaluation_scores;
CREATE POLICY "Users can manage evaluation scores"
ON public.evaluation_scores FOR ALL TO authenticated
USING (evaluation_id IN (
  SELECT evaluations.id FROM evaluations
  WHERE ((evaluations.evaluator_id = auth.uid()) AND (evaluations.type = 'coach'::evaluation_type))
     OR ((evaluations.player_id = auth.uid()) AND (evaluations.type = 'self'::evaluation_type) AND (evaluations.evaluator_id = auth.uid()))
))
WITH CHECK (evaluation_id IN (
  SELECT evaluations.id FROM evaluations
  WHERE ((evaluations.evaluator_id = auth.uid()) AND (evaluations.type = 'coach'::evaluation_type))
     OR ((evaluations.player_id = auth.uid()) AND (evaluations.type = 'self'::evaluation_type) AND (evaluations.evaluator_id = auth.uid()))
));

-- ============ evaluations ============
DROP POLICY IF EXISTS "Club admins can view evaluations in their club" ON public.evaluations;
CREATE POLICY "Club admins can view evaluations in their club"
ON public.evaluations FOR SELECT TO authenticated
USING (is_admin(auth.uid()) OR is_club_admin(auth.uid(), get_player_club_id(player_id)));

DROP POLICY IF EXISTS "Supporters can create evaluations for their linked players" ON public.evaluations;
CREATE POLICY "Supporters can create evaluations for their linked players"
ON public.evaluations FOR INSERT TO authenticated
WITH CHECK (
  type = 'supporter'::evaluation_type
  AND evaluator_id = auth.uid()
  AND is_supporter_of_player(auth.uid(), player_id)
);

DROP POLICY IF EXISTS "Supporters can update their own evaluations" ON public.evaluations;
CREATE POLICY "Supporters can update their own evaluations"
ON public.evaluations FOR UPDATE TO authenticated
USING (
  type = 'supporter'::evaluation_type
  AND evaluator_id = auth.uid()
  AND is_supporter_of_player(auth.uid(), player_id)
)
WITH CHECK (
  type = 'supporter'::evaluation_type
  AND evaluator_id = auth.uid()
  AND is_supporter_of_player(auth.uid(), player_id)
);

DROP POLICY IF EXISTS "Users can create evaluations" ON public.evaluations;
CREATE POLICY "Users can create evaluations"
ON public.evaluations FOR INSERT TO authenticated
WITH CHECK (
  ((evaluator_id = auth.uid()) AND (type = 'coach'::evaluation_type))
  OR ((player_id = auth.uid()) AND (type = 'self'::evaluation_type) AND (evaluator_id = auth.uid()))
);

DROP POLICY IF EXISTS "Users can soft delete their evaluations" ON public.evaluations;
CREATE POLICY "Users can soft delete their evaluations"
ON public.evaluations FOR UPDATE TO authenticated
USING (
  evaluator_id = auth.uid()
  OR (player_id = auth.uid() AND type = 'self'::evaluation_type)
)
WITH CHECK (
  evaluator_id = auth.uid()
  OR (player_id = auth.uid() AND type = 'self'::evaluation_type)
);

DROP POLICY IF EXISTS "Users can update their evaluations" ON public.evaluations;
CREATE POLICY "Users can update their evaluations"
ON public.evaluations FOR UPDATE TO authenticated
USING (
  ((evaluator_id = auth.uid()) AND (type = 'coach'::evaluation_type))
  OR ((player_id = auth.uid()) AND (type = 'self'::evaluation_type) AND (evaluator_id = auth.uid()))
)
WITH CHECK (
  ((evaluator_id = auth.uid()) AND (type = 'coach'::evaluation_type))
  OR ((player_id = auth.uid()) AND (type = 'self'::evaluation_type) AND (evaluator_id = auth.uid()))
);

-- ============ role_requests ============
DROP POLICY IF EXISTS "Admins manage requests" ON public.role_requests;
CREATE POLICY "Admins manage requests"
ON public.role_requests FOR UPDATE TO authenticated
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins view all requests" ON public.role_requests;
CREATE POLICY "Admins view all requests"
ON public.role_requests FOR SELECT TO authenticated
USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Users create own requests" ON public.role_requests;
CREATE POLICY "Users create own requests"
ON public.role_requests FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users view own requests" ON public.role_requests;
CREATE POLICY "Users view own requests"
ON public.role_requests FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- ============ skills ============
DROP POLICY IF EXISTS "Club admin manage club framework skills" ON public.skills;
CREATE POLICY "Club admin manage club framework skills"
ON public.skills FOR ALL TO authenticated
USING (theme_id IN (
  SELECT th.id FROM themes th
  JOIN competence_frameworks cf ON th.framework_id = cf.id
  WHERE cf.club_id IS NOT NULL AND cf.team_id IS NULL
    AND is_club_admin(auth.uid(), cf.club_id)
))
WITH CHECK (theme_id IN (
  SELECT th.id FROM themes th
  JOIN competence_frameworks cf ON th.framework_id = cf.id
  WHERE cf.club_id IS NOT NULL AND cf.team_id IS NULL
    AND is_club_admin(auth.uid(), cf.club_id)
));

-- ============ supporter_evaluation_requests ============
DROP POLICY IF EXISTS "Admins have full access to supporter evaluation requests" ON public.supporter_evaluation_requests;
CREATE POLICY "Admins have full access to supporter evaluation requests"
ON public.supporter_evaluation_requests FOR ALL TO authenticated
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Club admins can manage supporter evaluation requests" ON public.supporter_evaluation_requests;
CREATE POLICY "Club admins can manage supporter evaluation requests"
ON public.supporter_evaluation_requests FOR ALL TO authenticated
USING (is_club_admin(auth.uid(), get_player_club_id(player_id)))
WITH CHECK (is_club_admin(auth.uid(), get_player_club_id(player_id)));

DROP POLICY IF EXISTS "Coaches can create supporter evaluation requests" ON public.supporter_evaluation_requests;
CREATE POLICY "Coaches can create supporter evaluation requests"
ON public.supporter_evaluation_requests FOR INSERT TO authenticated
WITH CHECK (
  requested_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM team_members tm1
    JOIN team_members tm2 ON tm1.team_id = tm2.team_id
    WHERE tm1.user_id = auth.uid() AND tm1.member_type = 'coach' AND tm1.is_active = true
      AND tm2.user_id = supporter_evaluation_requests.player_id AND tm2.member_type = 'player' AND tm2.is_active = true
  )
  AND is_supporter_of_player(supporter_id, player_id)
);

DROP POLICY IF EXISTS "Coaches can update their evaluation requests" ON public.supporter_evaluation_requests;
CREATE POLICY "Coaches can update their evaluation requests"
ON public.supporter_evaluation_requests FOR UPDATE TO authenticated
USING (requested_by = auth.uid());

DROP POLICY IF EXISTS "Coaches can view their evaluation requests" ON public.supporter_evaluation_requests;
CREATE POLICY "Coaches can view their evaluation requests"
ON public.supporter_evaluation_requests FOR SELECT TO authenticated
USING (requested_by = auth.uid());

DROP POLICY IF EXISTS "Supporters can update their own requests" ON public.supporter_evaluation_requests;
CREATE POLICY "Supporters can update their own requests"
ON public.supporter_evaluation_requests FOR UPDATE TO authenticated
USING (supporter_id = auth.uid())
WITH CHECK (supporter_id = auth.uid());

DROP POLICY IF EXISTS "Supporters can view their pending requests" ON public.supporter_evaluation_requests;
CREATE POLICY "Supporters can view their pending requests"
ON public.supporter_evaluation_requests FOR SELECT TO authenticated
USING (supporter_id = auth.uid());

-- ============ themes ============
DROP POLICY IF EXISTS "Club admin manage club framework themes" ON public.themes;
CREATE POLICY "Club admin manage club framework themes"
ON public.themes FOR ALL TO authenticated
USING (framework_id IN (
  SELECT cf.id FROM competence_frameworks cf
  WHERE cf.club_id IS NOT NULL AND cf.team_id IS NULL
    AND is_club_admin(auth.uid(), cf.club_id)
))
WITH CHECK (framework_id IN (
  SELECT cf.id FROM competence_frameworks cf
  WHERE cf.club_id IS NOT NULL AND cf.team_id IS NULL
    AND is_club_admin(auth.uid(), cf.club_id)
));