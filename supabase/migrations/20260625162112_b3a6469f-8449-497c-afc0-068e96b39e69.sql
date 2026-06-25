CREATE POLICY "Staff and minor read guardian designation"
ON public.guardian_designations
FOR SELECT
TO authenticated
USING (
  public.is_coach_of_player(auth.uid(), minor_profile_id)
  OR public.is_club_admin(auth.uid(), public.get_player_club_id(minor_profile_id))
  OR minor_profile_id = auth.uid()
);