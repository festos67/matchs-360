CREATE OR REPLACE FUNCTION public.create_trial_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_season RECORD;
BEGIN
  SELECT * INTO v_season FROM public.get_current_season();

  INSERT INTO public.subscriptions (
    club_id, plan, source, starts_at, ends_at,
    season_start, season_end, is_trial, amount_cents, auto_renew
  ) VALUES (
    NEW.id,
    'pro',
    'trial',
    CURRENT_DATE,
    CURRENT_DATE + INTERVAL '90 days',
    v_season.season_start,
    v_season.season_end,
    true,
    0,
    false
  );

  RETURN NEW;
END;
$$;

UPDATE public.plan_limits SET can_export_pdf = true WHERE plan = 'pro';

UPDATE public.subscriptions
SET ends_at = starts_at + INTERVAL '90 days'
WHERE is_trial = true
  AND ends_at >= CURRENT_DATE
  AND ends_at < starts_at + INTERVAL '90 days';