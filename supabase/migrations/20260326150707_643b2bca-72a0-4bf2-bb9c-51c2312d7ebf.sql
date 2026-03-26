CREATE POLICY "Players view teammates in their team"
ON public.team_members
FOR SELECT
TO authenticated
USING (
  is_active = true 
  AND team_id IN (
    SELECT tm.team_id 
    FROM public.team_members tm 
    WHERE tm.user_id = auth.uid() 
      AND tm.is_active = true
  )
);