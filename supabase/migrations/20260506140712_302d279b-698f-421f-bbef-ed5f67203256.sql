
DROP POLICY IF EXISTS "Coaches can create supporter evaluation requests" ON public.supporter_evaluation_requests;

CREATE POLICY "Coaches can create supporter evaluation requests"
ON public.supporter_evaluation_requests
FOR INSERT
TO authenticated
WITH CHECK (
  requested_by = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.team_members tm1
    JOIN public.team_members tm2 ON tm1.team_id = tm2.team_id
    WHERE tm1.user_id = auth.uid()
      AND tm1.member_type = 'coach'
      AND tm1.is_active = true
      AND tm2.user_id = supporter_evaluation_requests.player_id
      AND tm2.member_type = 'player'
      AND tm2.is_active = true
  )
  AND EXISTS (
    SELECT 1 FROM public.supporters_link sl
    WHERE sl.supporter_id = supporter_evaluation_requests.supporter_id
      AND sl.player_id = supporter_evaluation_requests.player_id
  )
);
