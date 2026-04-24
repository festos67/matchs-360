-- F-503 — Restrict storage DELETE on objective-attachments
-- Previously any user passing can_write_objective_attachment (incl. assistant coaches)
-- could delete files uploaded by colleagues, breaking links and creating DB orphans.
-- We now restrict storage DELETE to admins, club admins, and referent coaches of the team.

DROP POLICY IF EXISTS "objective-attachments scoped delete" ON storage.objects;

CREATE POLICY "objective-attachments scoped delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'objective-attachments'
  AND EXISTS (
    SELECT 1
    FROM public.objective_attachments oa
    JOIN public.team_objectives t_obj ON t_obj.id = oa.objective_id
    WHERE oa.file_path = storage.objects.name
      AND (
        public.is_admin(auth.uid())
        OR public.is_club_admin_of_team(auth.uid(), t_obj.team_id)
        OR public.is_referent_coach_of_team(auth.uid(), t_obj.team_id)
      )
  )
);