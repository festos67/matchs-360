ALTER TABLE public.subscriptions DISABLE TRIGGER USER;

UPDATE public.subscriptions
SET plan = 'pro',
    is_trial = false,
    ends_at = '2027-05-30',
    season_end = '2027-05-30',
    updated_at = now()
WHERE club_id = 'e1e4f98e-8ca2-4f9a-a194-4523c0cc7de1';

ALTER TABLE public.subscriptions ENABLE TRIGGER USER;