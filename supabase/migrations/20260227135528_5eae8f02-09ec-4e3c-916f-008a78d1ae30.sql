
ALTER TABLE public.competence_frameworks
ADD COLUMN is_archived boolean NOT NULL DEFAULT false;

ALTER TABLE public.competence_frameworks
ADD COLUMN archived_at timestamp with time zone;
