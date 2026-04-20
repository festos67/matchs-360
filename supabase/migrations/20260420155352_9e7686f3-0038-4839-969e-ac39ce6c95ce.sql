-- Enums
CREATE TYPE public.subscription_plan AS ENUM ('free', 'pro');
CREATE TYPE public.subscription_source AS ENUM ('direct', 'trial', 'district', 'league', 'federation');

-- Table subscriptions
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  plan public.subscription_plan NOT NULL DEFAULT 'free',
  source public.subscription_source NOT NULL DEFAULT 'direct',

  starts_at DATE NOT NULL,
  ends_at DATE NOT NULL,

  season_start DATE NOT NULL,
  season_end DATE NOT NULL,

  is_trial BOOLEAN NOT NULL DEFAULT false,
  stripe_subscription_id TEXT,
  stripe_customer_id TEXT,
  amount_cents INTEGER,

  auto_renew BOOLEAN NOT NULL DEFAULT true,
  renewed_from UUID REFERENCES public.subscriptions(id),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_subscriptions_club_id ON public.subscriptions(club_id);
CREATE INDEX idx_subscriptions_club_period ON public.subscriptions(club_id, starts_at, ends_at);

-- RLS
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Club admins can view their subscription"
  ON public.subscriptions FOR SELECT TO authenticated
  USING (
    club_id IN (SELECT public.get_user_club_ids(auth.uid()))
  );

CREATE POLICY "Admins can manage all subscriptions"
  ON public.subscriptions FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Trigger updated_at
CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Fonction: get_club_plan
CREATE OR REPLACE FUNCTION public.get_club_plan(p_club_id UUID)
RETURNS public.subscription_plan
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (
      SELECT plan FROM public.subscriptions
      WHERE club_id = p_club_id
        AND starts_at <= CURRENT_DATE
        AND ends_at >= CURRENT_DATE
      ORDER BY
        CASE plan WHEN 'pro' THEN 0 ELSE 1 END,
        created_at DESC
      LIMIT 1
    ),
    'free'::public.subscription_plan
  );
$$;

-- Fonction: get_current_season
CREATE OR REPLACE FUNCTION public.get_current_season()
RETURNS TABLE(season_start DATE, season_end DATE)
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$
  SELECT
    CASE
      WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 8
      THEN make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int, 8, 1)
      ELSE make_date((EXTRACT(YEAR FROM CURRENT_DATE) - 1)::int, 8, 1)
    END AS season_start,
    CASE
      WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 8
      THEN make_date((EXTRACT(YEAR FROM CURRENT_DATE) + 1)::int, 7, 31)
      ELSE make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int, 7, 31)
    END AS season_end;
$$;

-- Fonction: calculate_prorata_amount
CREATE OR REPLACE FUNCTION public.calculate_prorata_amount(
  p_start_date DATE,
  p_full_price_cents INTEGER DEFAULT 9900
)
RETURNS INTEGER
LANGUAGE plpgsql STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_season RECORD;
  v_total_days INTEGER;
  v_remaining_days INTEGER;
BEGIN
  SELECT * INTO v_season FROM public.get_current_season();

  v_total_days := v_season.season_end - v_season.season_start;
  v_remaining_days := v_season.season_end - p_start_date;

  IF v_remaining_days < 30 THEN
    v_remaining_days := 30;
  END IF;

  RETURN ROUND((p_full_price_cents::numeric * v_remaining_days) / v_total_days);
END;
$$;