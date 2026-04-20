
-- ============================================================================
-- 1) Supprimer le trigger qui bloque la création d'évaluations au-delà du seuil
--    (la limite devient visuelle, pas bloquante)
-- ============================================================================
DROP TRIGGER IF EXISTS trg_check_evaluation_limit ON public.evaluations;
DROP FUNCTION IF EXISTS public.check_evaluation_limit();

-- ============================================================================
-- 2) Prorata calculé en mois entiers (spec: "4 mois / 12")
-- ============================================================================
CREATE OR REPLACE FUNCTION public.calculate_prorata_amount(
  p_start_date date,
  p_full_price_cents integer DEFAULT 9900
)
RETURNS integer
LANGUAGE plpgsql STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_season RECORD;
  v_months_remaining INTEGER;
BEGIN
  SELECT * INTO v_season FROM public.get_current_season();

  -- Mois entiers restants (au moins 1)
  v_months_remaining := GREATEST(
    1,
    (EXTRACT(YEAR FROM age(v_season.season_end, p_start_date)) * 12
     + EXTRACT(MONTH FROM age(v_season.season_end, p_start_date)))::INTEGER
  );

  -- Plafonnage à 12 mois (saison = 12 mois)
  IF v_months_remaining > 12 THEN
    v_months_remaining := 12;
  END IF;

  RETURN ROUND((p_full_price_cents::numeric * v_months_remaining) / 12);
END;
$$;

-- ============================================================================
-- 3) Trigger sur supporters_link : max N supporters par équipe (selon le plan)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.check_supporter_limit()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_club_id UUID;
  v_plan public.subscription_plan;
  v_limit INTEGER;
  v_count INTEGER;
  v_team_id UUID;
BEGIN
  -- Club du joueur lié
  SELECT t.club_id, t.id INTO v_club_id, v_team_id
  FROM public.team_members tm
  JOIN public.teams t ON tm.team_id = t.id
  WHERE tm.user_id = NEW.player_id
    AND tm.member_type = 'player'
    AND tm.is_active = true
    AND tm.deleted_at IS NULL
  LIMIT 1;

  IF v_club_id IS NULL OR v_team_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT public.get_club_plan(v_club_id) INTO v_plan;
  SELECT max_supporters_per_team INTO v_limit
  FROM public.plan_limits WHERE plan = v_plan;

  -- Compter les supporters distincts liés à au moins un joueur de cette équipe
  SELECT COUNT(DISTINCT sl.supporter_id) INTO v_count
  FROM public.supporters_link sl
  JOIN public.team_members tm ON tm.user_id = sl.player_id
    AND tm.member_type = 'player'
    AND tm.is_active = true
    AND tm.deleted_at IS NULL
  WHERE tm.team_id = v_team_id;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'PLAN_LIMIT_SUPPORTERS:Limite du plan % atteinte : % supporter(s) par équipe maximum. Passez en Pro pour en ajouter plus.', v_plan, v_limit;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_supporter_limit ON public.supporters_link;
CREATE TRIGGER trg_check_supporter_limit
  BEFORE INSERT ON public.supporters_link
  FOR EACH ROW
  EXECUTE FUNCTION public.check_supporter_limit();

-- ============================================================================
-- 4) Notifications trial : anti-doublon via titre + date du jour
--    On vérifie qu'aucune notification identique n'a été envoyée aujourd'hui
--    au même user avant d'insérer.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_trial_notifications()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sub RECORD;
  v_user RECORD;
BEGIN
  -- J-7 : club_admin + coaches
  FOR v_sub IN
    SELECT s.*, c.name AS club_name
    FROM public.subscriptions s
    JOIN public.clubs c ON c.id = s.club_id
    WHERE s.is_trial = true AND s.plan = 'pro'
      AND s.ends_at = CURRENT_DATE + INTERVAL '7 days'
  LOOP
    FOR v_user IN
      SELECT DISTINCT ur.user_id FROM public.user_roles ur
      WHERE ur.club_id = v_sub.club_id
        AND ur.role IN ('club_admin', 'coach')
    LOOP
      INSERT INTO public.notifications (user_id, title, message, type, link)
      SELECT v_user.user_id,
        'Essai Pro : 7 jours restants',
        'Votre essai Pro pour ' || v_sub.club_name || ' se termine dans 7 jours. Passez en Pro pour ne rien perdre.',
        'subscription', '/pricing'
      WHERE NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.user_id = v_user.user_id
          AND n.title = 'Essai Pro : 7 jours restants'
          AND n.created_at::date = CURRENT_DATE
      );
    END LOOP;
  END LOOP;

  -- J-1 : club_admin only
  FOR v_sub IN
    SELECT s.*, c.name AS club_name
    FROM public.subscriptions s
    JOIN public.clubs c ON c.id = s.club_id
    WHERE s.is_trial = true AND s.plan = 'pro'
      AND s.ends_at = CURRENT_DATE + INTERVAL '1 day'
  LOOP
    INSERT INTO public.notifications (user_id, title, message, type, link)
    SELECT ur.user_id,
      'Dernier jour d''essai Pro !',
      'Demain, ' || v_sub.club_name || ' passera au plan gratuit. Passez en Pro maintenant.',
      'subscription', '/pricing'
    FROM public.user_roles ur
    WHERE ur.club_id = v_sub.club_id
      AND ur.role = 'club_admin'
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.user_id = ur.user_id
          AND n.title = 'Dernier jour d''essai Pro !'
          AND n.created_at::date = CURRENT_DATE
      );
  END LOOP;

  -- J0 : fin d'essai
  FOR v_sub IN
    SELECT s.*, c.name AS club_name
    FROM public.subscriptions s
    JOIN public.clubs c ON c.id = s.club_id
    WHERE s.is_trial = true AND s.plan = 'pro'
      AND s.ends_at = CURRENT_DATE
  LOOP
    FOR v_user IN
      SELECT DISTINCT ur.user_id FROM public.user_roles ur
      WHERE ur.club_id = v_sub.club_id
        AND ur.role IN ('club_admin', 'coach')
    LOOP
      INSERT INTO public.notifications (user_id, title, message, type, link)
      SELECT v_user.user_id,
        'Essai Pro terminé',
        'Votre essai Pro pour ' || v_sub.club_name || ' est terminé. Vous êtes maintenant sur le plan gratuit. Certaines fonctionnalités sont désormais limitées.',
        'subscription', '/pricing'
      WHERE NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.user_id = v_user.user_id
          AND n.title = 'Essai Pro terminé'
          AND n.created_at::date = CURRENT_DATE
      );
    END LOOP;
  END LOOP;

  -- J-30 : rappel renouvellement Pro payant
  FOR v_sub IN
    SELECT s.*, c.name AS club_name
    FROM public.subscriptions s
    JOIN public.clubs c ON c.id = s.club_id
    WHERE s.plan = 'pro' AND s.is_trial = false AND s.auto_renew = true
      AND s.ends_at = CURRENT_DATE + INTERVAL '30 days'
  LOOP
    INSERT INTO public.notifications (user_id, title, message, type, link)
    SELECT ur.user_id,
      'Renouvellement Pro dans 30 jours',
      'Votre abonnement Pro pour ' || v_sub.club_name || ' se renouvelle automatiquement le ' || to_char(v_sub.ends_at + 1, 'DD/MM/YYYY') || '. Désactivez le renouvellement avant cette date si vous ne souhaitez pas renouveler.',
      'subscription', '/pricing'
    FROM public.user_roles ur
    WHERE ur.club_id = v_sub.club_id
      AND ur.role = 'club_admin'
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.user_id = ur.user_id
          AND n.title = 'Renouvellement Pro dans 30 jours'
          AND n.created_at::date = CURRENT_DATE
      );
  END LOOP;
END;
$$;

-- ============================================================================
-- 5) RLS : autoriser club_admin à modifier son propre abonnement
--    (pour désactiver auto_renew depuis /pricing)
-- ============================================================================
DROP POLICY IF EXISTS "Club admins can update their subscription" ON public.subscriptions;
CREATE POLICY "Club admins can update their subscription"
ON public.subscriptions
FOR UPDATE TO authenticated
USING (public.is_club_admin(auth.uid(), club_id))
WITH CHECK (public.is_club_admin(auth.uid(), club_id));
