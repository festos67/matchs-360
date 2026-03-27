CREATE POLICY "Players view their own supporter links"
ON public.supporters_link
FOR SELECT
TO authenticated
USING (player_id = auth.uid());