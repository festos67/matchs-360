
-- Table for individual player objectives
CREATE TABLE public.player_objectives (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  player_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  is_priority BOOLEAN NOT NULL DEFAULT false,
  priority INTEGER NOT NULL DEFAULT 2,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.player_objectives ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "Admin full access to player_objectives"
ON public.player_objectives FOR ALL TO authenticated
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));

-- Club admin manage
CREATE POLICY "Club admin manage player_objectives"
ON public.player_objectives FOR ALL TO authenticated
USING (is_club_admin_of_team(auth.uid(), team_id))
WITH CHECK (is_club_admin_of_team(auth.uid(), team_id));

-- Referent coach manage
CREATE POLICY "Referent coach manage player_objectives"
ON public.player_objectives FOR ALL TO authenticated
USING (is_referent_coach_of_team(auth.uid(), team_id))
WITH CHECK (is_referent_coach_of_team(auth.uid(), team_id));

-- Coaches view
CREATE POLICY "Coaches view player_objectives"
ON public.player_objectives FOR SELECT TO authenticated
USING (is_coach_of_team(auth.uid(), team_id));

-- Players view own objectives
CREATE POLICY "Players view own player_objectives"
ON public.player_objectives FOR SELECT TO authenticated
USING (player_id = auth.uid());

-- Trigger for updated_at
CREATE TRIGGER update_player_objectives_updated_at
BEFORE UPDATE ON public.player_objectives
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Attachments table
CREATE TABLE public.player_objective_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  objective_id UUID NOT NULL REFERENCES public.player_objectives(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT,
  file_size BIGINT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.player_objective_attachments ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "Admin full access to player_objective_attachments"
ON public.player_objective_attachments FOR ALL TO authenticated
USING (objective_id IN (SELECT id FROM public.player_objectives WHERE is_admin(auth.uid())))
WITH CHECK (objective_id IN (SELECT id FROM public.player_objectives WHERE is_admin(auth.uid())));

-- Club admin manage
CREATE POLICY "Club admin manage player_objective_attachments"
ON public.player_objective_attachments FOR ALL TO authenticated
USING (objective_id IN (SELECT id FROM public.player_objectives WHERE is_club_admin_of_team(auth.uid(), team_id)))
WITH CHECK (objective_id IN (SELECT id FROM public.player_objectives WHERE is_club_admin_of_team(auth.uid(), team_id)));

-- Referent coach manage
CREATE POLICY "Referent coach manage player_objective_attachments"
ON public.player_objective_attachments FOR ALL TO authenticated
USING (objective_id IN (SELECT id FROM public.player_objectives WHERE is_referent_coach_of_team(auth.uid(), team_id)))
WITH CHECK (objective_id IN (SELECT id FROM public.player_objectives WHERE is_referent_coach_of_team(auth.uid(), team_id)));

-- Coaches view
CREATE POLICY "Coaches view player_objective_attachments"
ON public.player_objective_attachments FOR SELECT TO authenticated
USING (objective_id IN (SELECT id FROM public.player_objectives WHERE is_coach_of_team(auth.uid(), team_id)));

-- Players view own
CREATE POLICY "Players view own player_objective_attachments"
ON public.player_objective_attachments FOR SELECT TO authenticated
USING (objective_id IN (SELECT id FROM public.player_objectives WHERE player_id = auth.uid()));
