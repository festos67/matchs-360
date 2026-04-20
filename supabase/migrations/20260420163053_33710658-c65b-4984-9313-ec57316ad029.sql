-- Function to create lifecycle notifications (trial reminders, end of trial)
CREATE OR REPLACE FUNCTION public.create_trial_notifications()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sub RECORD;
  v_user RECORD;
BEGIN
  -- J-7 : reminder to club_admin + coaches
  FOR v_sub IN
    SELECT s.*, c.name AS club_name
    FROM public.subscriptions s
    JOIN public.clubs c ON c.id = s.club_id
    WHERE s.is_trial = true
      AND s.plan = 'pro'
      AND s.ends_at = CURRENT_DATE + INTERVAL '7 days'
  LOOP
    FOR v_user IN
      SELECT DISTINCT ur.user_id
      FROM public.user_roles ur
      WHERE ur.club_id = v_sub.club_id
        AND ur.role IN ('club_admin', 'coach')
    LOOP
      INSERT INTO public.notifications (user_id, title, message, type, link)
      VALUES (
        v_user.user_id,
        'Essai Pro : 7 jours restants',
        'Votre essai Pro pour ' || v_sub.club_name || ' se termine dans 7 jours. Passez en Pro pour ne rien perdre.',
        'subscription',
        '/pricing'
      );
    END LOOP;
  END LOOP;

  -- J-1 : last day reminder to club_admin only
  FOR v_sub IN
    SELECT s.*, c.name AS club_name
    FROM public.subscriptions s
    JOIN public.clubs c ON c.id = s.club_id
    WHERE s.is_trial = true
      AND s.plan = 'pro'
      AND s.ends_at = CURRENT_DATE + INTERVAL '1 day'
  LOOP
    INSERT INTO public.notifications (user_id, title, message, type, link)
    SELECT ur.user_id,
      'Dernier jour d''essai Pro !',
      'Demain, ' || v_sub.club_name || ' passera au plan gratuit. Passez en Pro maintenant.',
      'subscription',
      '/pricing'
    FROM public.user_roles ur
    WHERE ur.club_id = v_sub.club_id AND ur.role = 'club_admin';
  END LOOP;

  -- J0 : trial ended, notify club_admin + coaches
  FOR v_sub IN
    SELECT s.*, c.name AS club_name
    FROM public.subscriptions s
    JOIN public.clubs c ON c.id = s.club_id
    WHERE s.is_trial = true
      AND s.plan = 'pro'
      AND s.ends_at = CURRENT_DATE
  LOOP
    FOR v_user IN
      SELECT DISTINCT ur.user_id
      FROM public.user_roles ur
      WHERE ur.club_id = v_sub.club_id
        AND ur.role IN ('club_admin', 'coach')
    LOOP
      INSERT INTO public.notifications (user_id, title, message, type, link)
      VALUES (
        v_user.user_id,
        'Essai Pro terminé',
        'Votre essai Pro pour ' || v_sub.club_name || ' est terminé. Vous êtes maintenant sur le plan gratuit. Certaines fonctionnalités sont désormais limitées.',
        'subscription',
        '/pricing'
      );
    END LOOP;
  END LOOP;

  -- J-30 before season end : annual renewal reminder for paid Pro subscriptions
  FOR v_sub IN
    SELECT s.*, c.name AS club_name
    FROM public.subscriptions s
    JOIN public.clubs c ON c.id = s.club_id
    WHERE s.plan = 'pro'
      AND s.is_trial = false
      AND s.auto_renew = true
      AND s.ends_at = CURRENT_DATE + INTERVAL '30 days'
  LOOP
    INSERT INTO public.notifications (user_id, title, message, type, link)
    SELECT ur.user_id,
      'Renouvellement Pro dans 30 jours',
      'Votre abonnement Pro pour ' || v_sub.club_name || ' se renouvelle automatiquement le ' || to_char(v_sub.ends_at + 1, 'DD/MM/YYYY') || '. Désactivez le renouvellement avant cette date si vous ne souhaitez pas renouveler.',
      'subscription',
      '/pricing'
    FROM public.user_roles ur
    WHERE ur.club_id = v_sub.club_id AND ur.role = 'club_admin';
  END LOOP;
END;
$$;

-- Ensure pg_cron is enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule daily at 08:00 UTC
SELECT cron.schedule(
  'trial-notifications-daily',
  '0 8 * * *',
  $$SELECT public.create_trial_notifications();$$
);