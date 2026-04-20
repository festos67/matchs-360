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
    CURRENT_DATE + INTERVAL '30 days',
    v_season.season_start,
    v_season.season_end,
    true,
    0,
    false
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_trial_on_club_creation ON public.clubs;

CREATE TRIGGER trg_create_trial_on_club_creation
  AFTER INSERT ON public.clubs
  FOR EACH ROW
  EXECUTE FUNCTION public.create_trial_subscription();