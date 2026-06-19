CREATE POLICY "Authorized staff can update coach evaluations"
ON public.evaluations
FOR UPDATE
TO authenticated
USING (
  type = 'coach'::evaluation_type
  AND deleted_at IS NULL
  AND (
    is_admin(auth.uid())
    OR is_club_admin(auth.uid(), get_player_club_id(player_id))
    OR is_coach_of_player(auth.uid(), player_id)
  )
)
WITH CHECK (
  type = 'coach'::evaluation_type
  AND (
    is_admin(auth.uid())
    OR is_club_admin(auth.uid(), get_player_club_id(player_id))
    OR is_coach_of_player(auth.uid(), player_id)
  )
);

CREATE POLICY "Authorized staff can manage coach evaluation scores"
ON public.evaluation_scores
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.evaluations e
    WHERE e.id = evaluation_scores.evaluation_id
      AND e.type = 'coach'::evaluation_type
      AND e.deleted_at IS NULL
      AND (
        is_admin(auth.uid())
        OR is_club_admin(auth.uid(), get_player_club_id(e.player_id))
        OR is_coach_of_player(auth.uid(), e.player_id)
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.evaluations e
    WHERE e.id = evaluation_scores.evaluation_id
      AND e.type = 'coach'::evaluation_type
      AND e.deleted_at IS NULL
      AND (
        is_admin(auth.uid())
        OR is_club_admin(auth.uid(), get_player_club_id(e.player_id))
        OR is_coach_of_player(auth.uid(), e.player_id)
      )
  )
);

CREATE POLICY "Authorized staff can manage coach evaluation objectives"
ON public.evaluation_objectives
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.evaluations e
    WHERE e.id = evaluation_objectives.evaluation_id
      AND e.type = 'coach'::evaluation_type
      AND e.deleted_at IS NULL
      AND (
        is_admin(auth.uid())
        OR is_club_admin(auth.uid(), get_player_club_id(e.player_id))
        OR is_coach_of_player(auth.uid(), e.player_id)
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.evaluations e
    WHERE e.id = evaluation_objectives.evaluation_id
      AND e.type = 'coach'::evaluation_type
      AND e.deleted_at IS NULL
      AND (
        is_admin(auth.uid())
        OR is_club_admin(auth.uid(), get_player_club_id(e.player_id))
        OR is_coach_of_player(auth.uid(), e.player_id)
      )
  )
);