-- Update RLS policies to allow supporters to create evaluations for their linked players
-- First, let supporters view evaluations for their linked players
CREATE POLICY "Supporters can view evaluations for their linked players"
ON public.evaluations
FOR SELECT
USING (
  is_supporter_of_player(auth.uid(), player_id)
);

-- Allow supporters to create evaluations for their linked players
CREATE POLICY "Supporters can create evaluations for their linked players"
ON public.evaluations
FOR INSERT
WITH CHECK (
  type = 'supporter_assessment'
  AND coach_id = auth.uid()
  AND is_supporter_of_player(auth.uid(), player_id)
);

-- Allow supporters to update their own evaluations
CREATE POLICY "Supporters can update their own evaluations"
ON public.evaluations
FOR UPDATE
USING (
  type = 'supporter_assessment'
  AND coach_id = auth.uid()
  AND is_supporter_of_player(auth.uid(), player_id)
)
WITH CHECK (
  type = 'supporter_assessment'
  AND coach_id = auth.uid()
  AND is_supporter_of_player(auth.uid(), player_id)
);

-- Allow supporters to manage evaluation scores for their evaluations
CREATE POLICY "Supporters can manage their evaluation scores"
ON public.evaluation_scores
FOR ALL
USING (
  evaluation_id IN (
    SELECT id FROM evaluations
    WHERE type = 'supporter_assessment'
    AND coach_id = auth.uid()
  )
)
WITH CHECK (
  evaluation_id IN (
    SELECT id FROM evaluations
    WHERE type = 'supporter_assessment'
    AND coach_id = auth.uid()
  )
);

-- Allow supporters to view evaluation scores for their linked players
CREATE POLICY "Supporters can view evaluation scores for linked players"
ON public.evaluation_scores
FOR SELECT
USING (
  evaluation_id IN (
    SELECT id FROM evaluations
    WHERE is_supporter_of_player(auth.uid(), player_id)
  )
);

-- Create a table to track supporter evaluation requests
CREATE TABLE IF NOT EXISTS public.supporter_evaluation_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  supporter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  evaluation_id UUID REFERENCES public.evaluations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days')
);

-- Create validation trigger for status instead of CHECK constraint
CREATE OR REPLACE FUNCTION public.validate_supporter_request_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status NOT IN ('pending', 'completed', 'expired') THEN
    RAISE EXCEPTION 'Invalid status value: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER check_supporter_request_status
BEFORE INSERT OR UPDATE ON public.supporter_evaluation_requests
FOR EACH ROW
EXECUTE FUNCTION public.validate_supporter_request_status();

-- Enable RLS on the new table
ALTER TABLE public.supporter_evaluation_requests ENABLE ROW LEVEL SECURITY;

-- Coaches can create requests for supporters of their players
CREATE POLICY "Coaches can create supporter evaluation requests"
ON public.supporter_evaluation_requests
FOR INSERT
WITH CHECK (
  requested_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM team_members tm1
    JOIN team_members tm2 ON tm1.team_id = tm2.team_id
    WHERE tm1.user_id = auth.uid()
    AND tm1.member_type = 'coach'
    AND tm1.is_active = true
    AND tm2.user_id = player_id
    AND tm2.member_type = 'player'
    AND tm2.is_active = true
  )
  AND is_supporter_of_player(supporter_id, player_id)
);

-- Coaches can view requests they created
CREATE POLICY "Coaches can view their evaluation requests"
ON public.supporter_evaluation_requests
FOR SELECT
USING (requested_by = auth.uid());

-- Coaches can update requests they created
CREATE POLICY "Coaches can update their evaluation requests"
ON public.supporter_evaluation_requests
FOR UPDATE
USING (requested_by = auth.uid());

-- Supporters can view requests addressed to them
CREATE POLICY "Supporters can view their pending requests"
ON public.supporter_evaluation_requests
FOR SELECT
USING (supporter_id = auth.uid());

-- Supporters can update their own requests (to complete them)
CREATE POLICY "Supporters can update their own requests"
ON public.supporter_evaluation_requests
FOR UPDATE
USING (supporter_id = auth.uid())
WITH CHECK (supporter_id = auth.uid());

-- Admins have full access
CREATE POLICY "Admins have full access to supporter evaluation requests"
ON public.supporter_evaluation_requests
FOR ALL
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));

-- Club admins can manage requests in their club
CREATE POLICY "Club admins can manage supporter evaluation requests"
ON public.supporter_evaluation_requests
FOR ALL
USING (
  player_id IN (
    SELECT id FROM profiles
    WHERE club_id IN (SELECT get_user_club_admin_ids(auth.uid()))
  )
)
WITH CHECK (
  player_id IN (
    SELECT id FROM profiles
    WHERE club_id IN (SELECT get_user_club_admin_ids(auth.uid()))
  )
);