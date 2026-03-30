
ALTER TABLE public.team_objectives ADD COLUMN IF NOT EXISTS order_index integer NOT NULL DEFAULT 0;
ALTER TABLE public.team_objectives ADD COLUMN IF NOT EXISTS is_priority boolean NOT NULL DEFAULT false;
UPDATE public.team_objectives SET is_priority = true WHERE priority = 1;
UPDATE public.team_objectives SET status = 'succeeded' WHERE status = 'achieved';
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY team_id ORDER BY created_at ASC) - 1 as rn
  FROM public.team_objectives
)
UPDATE public.team_objectives t SET order_index = o.rn FROM ordered o WHERE t.id = o.id;
