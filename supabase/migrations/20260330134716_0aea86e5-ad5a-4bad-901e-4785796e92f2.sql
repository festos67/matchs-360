
ALTER TABLE public.team_objectives DROP CONSTRAINT team_objectives_status_check;
ALTER TABLE public.team_objectives ADD CONSTRAINT team_objectives_status_check CHECK (status = ANY (ARRAY['todo'::text, 'in_progress'::text, 'achieved'::text, 'active'::text, 'succeeded'::text, 'missed'::text]));
