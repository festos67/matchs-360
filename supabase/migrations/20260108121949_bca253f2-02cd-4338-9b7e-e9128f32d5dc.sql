-- Allow club admins to view evaluations and related scores for players in their club

-- Evaluations: add SELECT policy for club admins
CREATE POLICY "Club admins can view evaluations in their club"
ON public.evaluations
FOR SELECT
USING (
  is_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = evaluations.player_id
      AND p.club_id IS NOT NULL
      AND is_club_admin(auth.uid(), p.club_id)
  )
);

-- Evaluation scores: add SELECT policy for club admins (scoped via evaluation->player club)
CREATE POLICY "Club admins can view evaluation scores in their club"
ON public.evaluation_scores
FOR SELECT
USING (
  is_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.evaluations e
    JOIN public.profiles p ON p.id = e.player_id
    WHERE e.id = evaluation_scores.evaluation_id
      AND p.club_id IS NOT NULL
      AND is_club_admin(auth.uid(), p.club_id)
  )
);

-- (Optional but consistent) Evaluation objectives: add SELECT policy for club admins
CREATE POLICY "Club admins can view evaluation objectives in their club"
ON public.evaluation_objectives
FOR SELECT
USING (
  is_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.evaluations e
    JOIN public.profiles p ON p.id = e.player_id
    WHERE e.id = evaluation_objectives.evaluation_id
      AND p.club_id IS NOT NULL
      AND is_club_admin(auth.uid(), p.club_id)
  )
);