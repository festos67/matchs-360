
-- Create team_objectives table
CREATE TABLE public.team_objectives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'achieved')),
  priority integer NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 3),
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.team_objectives ENABLE ROW LEVEL SECURITY;

-- Create objective_attachments table
CREATE TABLE public.objective_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  objective_id uuid NOT NULL REFERENCES public.team_objectives(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_type text,
  file_size bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.objective_attachments ENABLE ROW LEVEL SECURITY;

-- Create storage bucket for objective attachments
INSERT INTO storage.buckets (id, name, public) VALUES ('objective-attachments', 'objective-attachments', true);

-- Updated_at trigger for team_objectives
CREATE TRIGGER update_team_objectives_updated_at
  BEFORE UPDATE ON public.team_objectives
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS for team_objectives

-- Admins full access
CREATE POLICY "Admin full access to team_objectives"
  ON public.team_objectives FOR ALL TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

-- Club admin full access
CREATE POLICY "Club admin manage team_objectives"
  ON public.team_objectives FOR ALL TO authenticated
  USING (is_club_admin_of_team(auth.uid(), team_id))
  WITH CHECK (is_club_admin_of_team(auth.uid(), team_id));

-- Referent coach full access
CREATE POLICY "Referent coach manage team_objectives"
  ON public.team_objectives FOR ALL TO authenticated
  USING (is_referent_coach_of_team(auth.uid(), team_id))
  WITH CHECK (is_referent_coach_of_team(auth.uid(), team_id));

-- Non-referent coaches read only
CREATE POLICY "Coaches view team_objectives"
  ON public.team_objectives FOR SELECT TO authenticated
  USING (is_coach_of_team(auth.uid(), team_id));

-- Players read only
CREATE POLICY "Players view team_objectives"
  ON public.team_objectives FOR SELECT TO authenticated
  USING (is_player_in_team(auth.uid(), team_id));

-- RLS for objective_attachments (follow parent objective access)

CREATE POLICY "Admin full access to objective_attachments"
  ON public.objective_attachments FOR ALL TO authenticated
  USING (objective_id IN (SELECT id FROM public.team_objectives WHERE is_admin(auth.uid())))
  WITH CHECK (objective_id IN (SELECT id FROM public.team_objectives WHERE is_admin(auth.uid())));

CREATE POLICY "Club admin manage objective_attachments"
  ON public.objective_attachments FOR ALL TO authenticated
  USING (objective_id IN (SELECT id FROM public.team_objectives WHERE is_club_admin_of_team(auth.uid(), team_id)))
  WITH CHECK (objective_id IN (SELECT id FROM public.team_objectives WHERE is_club_admin_of_team(auth.uid(), team_id)));

CREATE POLICY "Referent coach manage objective_attachments"
  ON public.objective_attachments FOR ALL TO authenticated
  USING (objective_id IN (SELECT id FROM public.team_objectives WHERE is_referent_coach_of_team(auth.uid(), team_id)))
  WITH CHECK (objective_id IN (SELECT id FROM public.team_objectives WHERE is_referent_coach_of_team(auth.uid(), team_id)));

CREATE POLICY "Coaches view objective_attachments"
  ON public.objective_attachments FOR SELECT TO authenticated
  USING (objective_id IN (SELECT id FROM public.team_objectives WHERE is_coach_of_team(auth.uid(), team_id)));

CREATE POLICY "Players view objective_attachments"
  ON public.objective_attachments FOR SELECT TO authenticated
  USING (objective_id IN (SELECT id FROM public.team_objectives WHERE is_player_in_team(auth.uid(), team_id)));

-- Storage RLS for objective-attachments bucket
CREATE POLICY "Authenticated users can upload objective attachments"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'objective-attachments');

CREATE POLICY "Anyone can view objective attachments"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'objective-attachments');

CREATE POLICY "Authenticated users can delete objective attachments"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'objective-attachments');
