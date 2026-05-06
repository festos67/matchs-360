CREATE POLICY "Club members view their subscription"
ON public.subscriptions
FOR SELECT
TO authenticated
USING (club_id IN (SELECT public.get_user_club_ids(auth.uid())));